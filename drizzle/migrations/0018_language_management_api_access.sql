GRANT ALL ON public.language_settings, public.language_strings TO service_role;
NOTIFY pgrst, 'reload schema';