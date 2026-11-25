CREATE TABLE public.tune_list_positions (
  auth_user_id uuid NOT NULL DEFAULT auth.uid(),
  tune_key text NOT NULL,
  position double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, tune_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tune_list_positions TO authenticated;
GRANT ALL ON public.tune_list_positions TO service_role;
ALTER TABLE public.tune_list_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read tune positions" ON public.tune_list_positions FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Owners add tune positions" ON public.tune_list_positions FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Owners move tune positions" ON public.tune_list_positions FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Owners remove tune positions" ON public.tune_list_positions FOR DELETE TO authenticated USING (auth_user_id = auth.uid());