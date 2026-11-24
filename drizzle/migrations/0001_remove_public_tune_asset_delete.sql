DROP POLICY IF EXISTS "Allow public delete tune_assets" ON public.tune_assets;
REVOKE DELETE ON public.tune_assets FROM anon, authenticated;
GRANT ALL ON public.tune_assets TO service_role;