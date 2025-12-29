-- Create local_users table
CREATE TABLE public.local_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS with public access (no auth yet)
ALTER TABLE public.local_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read local_users" ON public.local_users FOR SELECT USING (true);
CREATE POLICY "Allow public insert local_users" ON public.local_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update local_users" ON public.local_users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete local_users" ON public.local_users FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_local_users_updated_at
  BEFORE UPDATE ON public.local_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add local_user_id to activity tracking tables
ALTER TABLE public.user_skill_state ADD COLUMN local_user_id uuid REFERENCES public.local_users(id) ON DELETE CASCADE;
ALTER TABLE public.lesson_runs ADD COLUMN local_user_id uuid REFERENCES public.local_users(id) ON DELETE CASCADE;
ALTER TABLE public.practice_sessions ADD COLUMN local_user_id uuid REFERENCES public.local_users(id) ON DELETE CASCADE;

-- Insert default user "Ed"
INSERT INTO public.local_users (name) VALUES ('Ed');