-- Create curriculum schema for runtime curriculum publishing and learner practice tracking
CREATE SCHEMA IF NOT EXISTS curriculum;

-- Create enum types
CREATE TYPE curriculum.curriculum_version_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE curriculum.curriculum_node_kind AS ENUM ('track', 'lesson', 'skill');
CREATE TYPE curriculum.curriculum_edge_type AS ENUM (
  'track_starts_with',
  'lesson_next',
  'lesson_requires_skill',
  'lesson_awards_skill'
);

-- ============================================================================
-- CURRICULUM PUBLISHING TABLES
-- ============================================================================

-- curriculum_versions: Versioned curriculum snapshots
CREATE TABLE curriculum.curriculum_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  status curriculum.curriculum_version_status NOT NULL DEFAULT 'draft',
  title TEXT,
  source JSONB
);

-- curriculum_nodes: Generic node table (tracks/lessons/skills)
CREATE TABLE curriculum.curriculum_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  kind curriculum.curriculum_node_kind NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_version_key UNIQUE (version_id, key)
);

-- curriculum_edges: Graph relationships
CREATE TABLE curriculum.curriculum_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES curriculum.curriculum_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES curriculum.curriculum_nodes(id) ON DELETE CASCADE,
  type curriculum.curriculum_edge_type NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_lesson_next UNIQUE (from_node_id) WHERE type = 'lesson_next'
);

-- curriculum_exports: Optional export snapshot
CREATE TABLE curriculum.curriculum_exports (
  version_id UUID PRIMARY KEY REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  exported_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- LEARNER PRACTICE TABLES
-- ============================================================================

-- practice_sessions: User practice sessions
CREATE TABLE curriculum.practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,
  context JSONB
);

-- lesson_runs: Individual lesson practice attempts
CREATE TABLE curriculum.lesson_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES curriculum.practice_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id),
  lesson_node_id UUID NOT NULL REFERENCES curriculum.curriculum_nodes(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  difficulty INTEGER,
  setup JSONB,
  target_sequence JSONB,
  user_recording JSONB,
  metronome_context JSONB,
  ai_instruction TEXT,
  ai_feedback TEXT,
  evaluation TEXT,
  scores JSONB,
  awarded_skill_keys TEXT[]
);

-- skill_unlock_events: Append-only unlock log
CREATE TABLE curriculum.skill_unlock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id),
  skill_node_id UUID NOT NULL REFERENCES curriculum.curriculum_nodes(id),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_lesson_run_id UUID REFERENCES curriculum.lesson_runs(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_user_version_skill UNIQUE (user_id, version_id, skill_node_id)
);

-- user_skill_state: Materialized skill progress view
CREATE TABLE curriculum.user_skill_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  skill_node_id UUID NOT NULL REFERENCES curriculum.curriculum_nodes(id) ON DELETE CASCADE,
  unlocked BOOLEAN NOT NULL DEFAULT false,
  mastery INTEGER CHECK (mastery >= 0 AND mastery <= 100),
  last_practiced_at TIMESTAMPTZ,
  stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, version_id, skill_node_id)
);

-- user_lesson_state: Materialized lesson progress view
CREATE TABLE curriculum.user_lesson_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  lesson_node_id UUID NOT NULL REFERENCES curriculum.curriculum_nodes(id) ON DELETE CASCADE,
  last_difficulty INTEGER,
  best_difficulty INTEGER,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, version_id, lesson_node_id)
);

-- session_plans: Teacher agent recommendations
CREATE TABLE curriculum.session_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  plan JSONB NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'teacher_agent'
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Curriculum indexes
CREATE INDEX idx_curriculum_nodes_version_kind ON curriculum.curriculum_nodes(version_id, kind);
CREATE INDEX idx_curriculum_nodes_version_key ON curriculum.curriculum_nodes(version_id, key);
CREATE INDEX idx_curriculum_edges_version_type ON curriculum.curriculum_edges(version_id, type);
CREATE INDEX idx_curriculum_edges_from_node ON curriculum.curriculum_edges(from_node_id);
CREATE INDEX idx_curriculum_edges_to_node ON curriculum.curriculum_edges(to_node_id);

-- Practice indexes
CREATE INDEX idx_practice_sessions_user_started ON curriculum.practice_sessions(user_id, started_at DESC);
CREATE INDEX idx_lesson_runs_user_started ON curriculum.lesson_runs(user_id, started_at DESC);
CREATE INDEX idx_lesson_runs_user_lesson_started ON curriculum.lesson_runs(user_id, lesson_node_id, started_at DESC);
CREATE INDEX idx_lesson_runs_version_lesson ON curriculum.lesson_runs(version_id, lesson_node_id);

-- Skill indexes
CREATE INDEX idx_skill_unlock_events_user_version ON curriculum.skill_unlock_events(user_id, version_id);
CREATE INDEX idx_skill_unlock_events_version_skill ON curriculum.skill_unlock_events(version_id, skill_node_id);

-- Session plans index
CREATE INDEX idx_session_plans_user_created ON curriculum.session_plans(user_id, created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger function to validate version consistency for edges
CREATE OR REPLACE FUNCTION curriculum.validate_edge_version_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure from_node and to_node belong to the same version
  IF (
    SELECT version_id FROM curriculum.curriculum_nodes WHERE id = NEW.from_node_id
  ) != (
    SELECT version_id FROM curriculum.curriculum_nodes WHERE id = NEW.to_node_id
  ) THEN
    RAISE EXCEPTION 'Edge nodes must belong to the same version';
  END IF;
  
  -- Ensure version_id matches the nodes' version
  IF NEW.version_id != (
    SELECT version_id FROM curriculum.curriculum_nodes WHERE id = NEW.from_node_id
  ) THEN
    RAISE EXCEPTION 'Edge version_id must match node version_id';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for version consistency
CREATE TRIGGER trigger_validate_edge_version_consistency
  BEFORE INSERT OR UPDATE ON curriculum.curriculum_edges
  FOR EACH ROW
  EXECUTE FUNCTION curriculum.validate_edge_version_consistency();

-- Trigger function for updated_at on state tables
CREATE OR REPLACE FUNCTION curriculum.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = curriculum;

-- Triggers for updated_at
CREATE TRIGGER update_user_skill_state_updated_at
  BEFORE UPDATE ON curriculum.user_skill_state
  FOR EACH ROW
  EXECUTE FUNCTION curriculum.update_updated_at_column();

CREATE TRIGGER update_user_lesson_state_updated_at
  BEFORE UPDATE ON curriculum.user_lesson_state
  FOR EACH ROW
  EXECUTE FUNCTION curriculum.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE curriculum.curriculum_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.curriculum_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.curriculum_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.curriculum_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.lesson_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.skill_unlock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.user_skill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.user_lesson_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.session_plans ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has editor/admin role
CREATE OR REPLACE FUNCTION curriculum.user_has_editor_role()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check auth.users.raw_user_meta_data for role
  -- Can be extended to use a separate roles table if needed
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') IN ('editor', 'admin'),
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for Curriculum Tables
-- Published versions: readable by all authenticated users
-- Draft versions: readable only by editors/admins

CREATE POLICY "Published curriculum readable by authenticated users"
  ON curriculum.curriculum_versions
  FOR SELECT
  USING (
    status = 'published' OR curriculum.user_has_editor_role()
  );

CREATE POLICY "Published nodes readable by authenticated users"
  ON curriculum.curriculum_nodes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curriculum.curriculum_versions cv
      WHERE cv.id = curriculum_nodes.version_id
      AND (cv.status = 'published' OR curriculum.user_has_editor_role())
    )
  );

CREATE POLICY "Published edges readable by authenticated users"
  ON curriculum.curriculum_edges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curriculum.curriculum_versions cv
      WHERE cv.id = curriculum_edges.version_id
      AND (cv.status = 'published' OR curriculum.user_has_editor_role())
    )
  );

CREATE POLICY "Published exports readable by authenticated users"
  ON curriculum.curriculum_exports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curriculum.curriculum_versions cv
      WHERE cv.id = curriculum_exports.version_id
      AND (cv.status = 'published' OR curriculum.user_has_editor_role())
    )
  );

-- Editors can insert/update/delete curriculum (for publishing workflow)
CREATE POLICY "Editors can manage curriculum versions"
  ON curriculum.curriculum_versions
  FOR ALL
  USING (curriculum.user_has_editor_role())
  WITH CHECK (curriculum.user_has_editor_role());

CREATE POLICY "Editors can manage curriculum nodes"
  ON curriculum.curriculum_nodes
  FOR ALL
  USING (curriculum.user_has_editor_role())
  WITH CHECK (curriculum.user_has_editor_role());

CREATE POLICY "Editors can manage curriculum edges"
  ON curriculum.curriculum_edges
  FOR ALL
  USING (curriculum.user_has_editor_role())
  WITH CHECK (curriculum.user_has_editor_role());

CREATE POLICY "Editors can manage curriculum exports"
  ON curriculum.curriculum_exports
  FOR ALL
  USING (curriculum.user_has_editor_role())
  WITH CHECK (curriculum.user_has_editor_role());

-- RLS Policies for Practice Tables
-- Users can only read/write their own data

CREATE POLICY "Users can manage their own practice sessions"
  ON curriculum.practice_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own lesson runs"
  ON curriculum.lesson_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own skill unlock events"
  ON curriculum.skill_unlock_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own skill state"
  ON curriculum.user_skill_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own lesson state"
  ON curriculum.user_lesson_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own session plans"
  ON curriculum.session_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Optional helper view for teacher agent context queries
-- Aggregates curriculum + user history for teacher agent
CREATE VIEW curriculum.teacher_context AS
SELECT 
  u.id AS user_id,
  cv.id AS version_id,
  cv.status AS version_status,
  cv.title AS version_title,
  -- User's lesson progress summary
  jsonb_agg(DISTINCT jsonb_build_object(
    'lesson_node_id', uls.lesson_node_id,
    'last_difficulty', uls.last_difficulty,
    'best_difficulty', uls.best_difficulty,
    'attempts_count', uls.attempts_count,
    'last_practiced_at', uls.last_practiced_at
  )) FILTER (WHERE uls.lesson_node_id IS NOT NULL) AS lesson_progress,
  -- User's skill progress summary
  jsonb_agg(DISTINCT jsonb_build_object(
    'skill_node_id', uss.skill_node_id,
    'unlocked', uss.unlocked,
    'mastery', uss.mastery,
    'last_practiced_at', uss.last_practiced_at
  )) FILTER (WHERE uss.skill_node_id IS NOT NULL) AS skill_progress,
  -- Recent lesson runs
  jsonb_agg(DISTINCT jsonb_build_object(
    'id', lr.id,
    'lesson_node_id', lr.lesson_node_id,
    'started_at', lr.started_at,
    'evaluation', lr.evaluation,
    'difficulty', lr.difficulty
  ) ORDER BY lr.started_at DESC) FILTER (WHERE lr.id IS NOT NULL) AS recent_runs
FROM auth.users u
CROSS JOIN curriculum.curriculum_versions cv
LEFT JOIN curriculum.user_lesson_state uls ON uls.user_id = u.id AND uls.version_id = cv.id
LEFT JOIN curriculum.user_skill_state uss ON uss.user_id = u.id AND uss.version_id = cv.id
LEFT JOIN curriculum.lesson_runs lr ON lr.user_id = u.id AND lr.version_id = cv.id
WHERE cv.status = 'published'
GROUP BY u.id, cv.id, cv.status, cv.title;

-- Grant access to the view
GRANT SELECT ON curriculum.teacher_context TO authenticated;

