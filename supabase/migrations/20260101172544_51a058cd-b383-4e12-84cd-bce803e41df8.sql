-- Fix user_skill_state unique constraint for proper user isolation

-- Drop the existing constraint (it's a constraint, not just an index)
ALTER TABLE public.user_skill_state 
DROP CONSTRAINT IF EXISTS user_skill_state_skill_key_key;

-- Clear ALL user activity data (since we're resetting everything)
DELETE FROM public.user_skill_state;
DELETE FROM public.lesson_runs;
DELETE FROM public.practice_sessions;

-- Add composite unique constraint for proper user isolation
ALTER TABLE public.user_skill_state 
ADD CONSTRAINT user_skill_state_skill_user_unique UNIQUE (skill_key, local_user_id);

-- Create index for performance on user + skill lookups
CREATE INDEX IF NOT EXISTS idx_user_skill_state_user_skill 
ON public.user_skill_state(local_user_id, skill_key);