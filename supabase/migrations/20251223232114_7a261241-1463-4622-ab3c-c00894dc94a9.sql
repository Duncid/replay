-- Create lesson_runs table to track individual lesson attempts
CREATE TABLE public.lesson_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_node_key TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  evaluation TEXT CHECK (evaluation IN ('pass', 'close', 'fail')),
  difficulty INTEGER NOT NULL DEFAULT 1,
  setup JSONB DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_skill_state table to track skill unlocks and mastery
CREATE TABLE public.user_skill_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_key TEXT NOT NULL UNIQUE,
  unlocked BOOLEAN NOT NULL DEFAULT false,
  mastery INTEGER NOT NULL DEFAULT 0 CHECK (mastery >= 0 AND mastery <= 100),
  last_practiced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create practice_sessions table for high-level session tracking
CREATE TABLE public.practice_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  lesson_run_ids UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.lesson_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- Create public access policies for lesson_runs (no auth for now)
CREATE POLICY "Allow public read lesson_runs" ON public.lesson_runs FOR SELECT USING (true);
CREATE POLICY "Allow public insert lesson_runs" ON public.lesson_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update lesson_runs" ON public.lesson_runs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete lesson_runs" ON public.lesson_runs FOR DELETE USING (true);

-- Create public access policies for user_skill_state
CREATE POLICY "Allow public read user_skill_state" ON public.user_skill_state FOR SELECT USING (true);
CREATE POLICY "Allow public insert user_skill_state" ON public.user_skill_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update user_skill_state" ON public.user_skill_state FOR UPDATE USING (true);
CREATE POLICY "Allow public delete user_skill_state" ON public.user_skill_state FOR DELETE USING (true);

-- Create public access policies for practice_sessions
CREATE POLICY "Allow public read practice_sessions" ON public.practice_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert practice_sessions" ON public.practice_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update practice_sessions" ON public.practice_sessions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete practice_sessions" ON public.practice_sessions FOR DELETE USING (true);

-- Add trigger for updated_at on user_skill_state
CREATE TRIGGER update_user_skill_state_updated_at
BEFORE UPDATE ON public.user_skill_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_lesson_runs_lesson_key ON public.lesson_runs(lesson_node_key);
CREATE INDEX idx_lesson_runs_started_at ON public.lesson_runs(started_at DESC);
CREATE INDEX idx_user_skill_state_skill_key ON public.user_skill_state(skill_key);
CREATE INDEX idx_practice_sessions_started_at ON public.practice_sessions(started_at DESC);