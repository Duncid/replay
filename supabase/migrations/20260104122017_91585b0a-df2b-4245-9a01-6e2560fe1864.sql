-- Create user_lesson_acquisition table for tracking acquired lessons
CREATE TABLE public.user_lesson_acquisition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id UUID REFERENCES public.local_users(id) ON DELETE CASCADE,
  lesson_key TEXT NOT NULL,
  acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(local_user_id, lesson_key)
);

-- Create index for efficient lookups
CREATE INDEX idx_user_lesson_acquisition_user_lesson 
  ON public.user_lesson_acquisition(local_user_id, lesson_key);

-- Enable Row Level Security
ALTER TABLE public.user_lesson_acquisition ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public access like other tables in this project)
CREATE POLICY "Allow public read user_lesson_acquisition" 
  ON public.user_lesson_acquisition FOR SELECT USING (true);
CREATE POLICY "Allow public insert user_lesson_acquisition" 
  ON public.user_lesson_acquisition FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update user_lesson_acquisition" 
  ON public.user_lesson_acquisition FOR UPDATE USING (true);
CREATE POLICY "Allow public delete user_lesson_acquisition" 
  ON public.user_lesson_acquisition FOR DELETE USING (true);