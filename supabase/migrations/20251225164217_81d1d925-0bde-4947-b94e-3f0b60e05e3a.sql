-- Add UNIQUE constraint on skill_key for proper upserting
ALTER TABLE public.user_skill_state 
ADD CONSTRAINT user_skill_state_skill_key_unique UNIQUE (skill_key);