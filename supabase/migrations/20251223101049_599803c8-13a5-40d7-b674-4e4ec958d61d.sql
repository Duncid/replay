-- Create curriculum schema
CREATE SCHEMA IF NOT EXISTS curriculum;

-- Create curriculum_versions table
CREATE TABLE curriculum.curriculum_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_graph_id UUID REFERENCES public.quest_graphs(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
  node_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  track_count INTEGER DEFAULT 0,
  lesson_count INTEGER DEFAULT 0,
  skill_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- Create curriculum_nodes table
CREATE TABLE curriculum.curriculum_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('track', 'lesson', 'skill')),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(version_id, key)
);

-- Create curriculum_edges table
CREATE TABLE curriculum.curriculum_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('track_starts_with', 'lesson_next', 'lesson_requires_skill', 'lesson_awards_skill')),
  from_key TEXT NOT NULL,
  to_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create curriculum_exports table (stores full snapshot for debugging/rollback)
CREATE TABLE curriculum.curriculum_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum.curriculum_versions(id) ON DELETE CASCADE,
  export_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_curriculum_nodes_version ON curriculum.curriculum_nodes(version_id);
CREATE INDEX idx_curriculum_nodes_kind ON curriculum.curriculum_nodes(kind);
CREATE INDEX idx_curriculum_nodes_key ON curriculum.curriculum_nodes(key);
CREATE INDEX idx_curriculum_edges_version ON curriculum.curriculum_edges(version_id);
CREATE INDEX idx_curriculum_edges_type ON curriculum.curriculum_edges(edge_type);
CREATE INDEX idx_curriculum_exports_version ON curriculum.curriculum_exports(version_id);

-- Enable RLS on all tables (public access for now, like other tables)
ALTER TABLE curriculum.curriculum_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.curriculum_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.curriculum_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum.curriculum_exports ENABLE ROW LEVEL SECURITY;

-- Create public access policies (matching existing tables)
CREATE POLICY "Allow public read" ON curriculum.curriculum_versions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON curriculum.curriculum_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON curriculum.curriculum_versions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON curriculum.curriculum_versions FOR DELETE USING (true);

CREATE POLICY "Allow public read" ON curriculum.curriculum_nodes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON curriculum.curriculum_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON curriculum.curriculum_nodes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON curriculum.curriculum_nodes FOR DELETE USING (true);

CREATE POLICY "Allow public read" ON curriculum.curriculum_edges FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON curriculum.curriculum_edges FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON curriculum.curriculum_edges FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON curriculum.curriculum_edges FOR DELETE USING (true);

CREATE POLICY "Allow public read" ON curriculum.curriculum_exports FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON curriculum.curriculum_exports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON curriculum.curriculum_exports FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON curriculum.curriculum_exports FOR DELETE USING (true);