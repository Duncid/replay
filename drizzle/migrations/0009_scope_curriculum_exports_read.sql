DROP POLICY IF EXISTS "Signed-in read curriculum exports" ON public.curriculum_exports;
CREATE POLICY "Read published curriculum exports" ON public.curriculum_exports
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.curriculum_versions v WHERE v.id = curriculum_exports.version_id AND v.status = 'published')
);