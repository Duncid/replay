-- Create tune_practice_runs table to track individual practice attempts
CREATE TABLE public.tune_practice_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tune_key TEXT NOT NULL,
  nugget_id TEXT NOT NULL,
  local_user_id UUID,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  evaluation TEXT CHECK (evaluation IN ('pass', 'close', 'fail')),
  user_recording JSONB,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create tune_nugget_state table to track progress per nugget per user
CREATE TABLE public.tune_nugget_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tune_key TEXT NOT NULL,
  nugget_id TEXT NOT NULL,
  local_user_id UUID,
  attempt_count INT DEFAULT 0,
  pass_count INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tune_key, nugget_id, local_user_id)
);

-- Enable RLS
ALTER TABLE public.tune_practice_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tune_nugget_state ENABLE ROW LEVEL SECURITY;

-- RLS policies for tune_practice_runs (public access for local user isolation)
CREATE POLICY "Allow public read for tune_practice_runs"
ON public.tune_practice_runs FOR SELECT
USING (true);

CREATE POLICY "Allow public insert for tune_practice_runs"
ON public.tune_practice_runs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update for tune_practice_runs"
ON public.tune_practice_runs FOR UPDATE
USING (true);

-- RLS policies for tune_nugget_state (public access for local user isolation)
CREATE POLICY "Allow public read for tune_nugget_state"
ON public.tune_nugget_state FOR SELECT
USING (true);

CREATE POLICY "Allow public insert for tune_nugget_state"
ON public.tune_nugget_state FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update for tune_nugget_state"
ON public.tune_nugget_state FOR UPDATE
USING (true);

-- Add trigger for updated_at on tune_nugget_state
CREATE TRIGGER update_tune_nugget_state_updated_at
BEFORE UPDATE ON public.tune_nugget_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();