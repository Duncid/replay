CREATE TABLE public.hidden_system_tunes (
  auth_user_id uuid NOT NULL DEFAULT auth.uid(),
  tune_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, tune_key)
);
GRANT SELECT, INSERT, DELETE ON public.hidden_system_tunes TO authenticated;
GRANT ALL ON public.hidden_system_tunes TO service_role;
ALTER TABLE public.hidden_system_tunes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read hidden tunes" ON public.hidden_system_tunes FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Owners hide tunes" ON public.hidden_system_tunes FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Owners unhide tunes" ON public.hidden_system_tunes FOR DELETE TO authenticated USING (auth_user_id = auth.uid());