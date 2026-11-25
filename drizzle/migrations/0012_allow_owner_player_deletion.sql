GRANT DELETE ON public.local_users TO authenticated;
CREATE POLICY "Owners delete profiles" ON public.local_users
  FOR DELETE TO authenticated USING (auth_user_id = auth.uid());

-- Profile deletion already cascades through skills, lessons and practice sessions.
-- Acquired tunes must follow the same lifecycle instead of blocking deletion.
ALTER TABLE public.user_tune_acquisition
  DROP CONSTRAINT user_tune_acquisition_local_user_id_fkey,
  ADD CONSTRAINT user_tune_acquisition_local_user_id_fkey
    FOREIGN KEY (local_user_id) REFERENCES public.local_users(id) ON DELETE CASCADE;

-- These older tables had no profile foreign keys. NOT VALID leaves historical
-- orphan rows untouched while enforcing new writes and cascading profile deletes.
ALTER TABLE public.tune_practice_runs
  ADD CONSTRAINT tune_practice_runs_local_user_id_fkey
    FOREIGN KEY (local_user_id) REFERENCES public.local_users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.tune_nugget_state
  ADD CONSTRAINT tune_nugget_state_local_user_id_fkey
    FOREIGN KEY (local_user_id) REFERENCES public.local_users(id) ON DELETE CASCADE NOT VALID;
