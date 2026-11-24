ALTER TABLE public.tune_assets ADD COLUMN owner_user_id uuid, ADD COLUMN is_global boolean NOT NULL DEFAULT true;
DROP POLICY IF EXISTS "Signed-in read tune assets" ON public.tune_assets;
CREATE POLICY "Read global or own tune assets" ON public.tune_assets FOR SELECT TO authenticated
USING (is_global OR owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));