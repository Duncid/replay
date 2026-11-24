CREATE TABLE public.tune_build_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  source_path text NOT NULL,
  filename text NOT NULL,
  tune_key text NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tune_build_jobs TO authenticated;
GRANT ALL ON public.tune_build_jobs TO service_role;
ALTER TABLE public.tune_build_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read build jobs" ON public.tune_build_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_tune_build_jobs_updated_at BEFORE UPDATE ON public.tune_build_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Admins upload tune sources" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tune-sources' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read tune sources" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'tune-sources' AND public.has_role(auth.uid(), 'admin'));