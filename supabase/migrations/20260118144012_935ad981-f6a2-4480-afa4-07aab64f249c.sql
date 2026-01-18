-- Create user_tune_acquisition table to track tune mastery
CREATE TABLE public.user_tune_acquisition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id UUID REFERENCES public.local_users(id),
  tune_key TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one acquisition per user per tune
ALTER TABLE public.user_tune_acquisition 
  ADD CONSTRAINT user_tune_acquisition_unique 
  UNIQUE (local_user_id, tune_key);

-- Enable RLS
ALTER TABLE public.user_tune_acquisition ENABLE ROW LEVEL SECURITY;

-- RLS policies (matching user_lesson_acquisition pattern)
CREATE POLICY "Allow public read on user_tune_acquisition" 
  ON public.user_tune_acquisition 
  FOR SELECT 
  USING (true);
  
CREATE POLICY "Allow public insert on user_tune_acquisition" 
  ON public.user_tune_acquisition 
  FOR INSERT 
  WITH CHECK (true);