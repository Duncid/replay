DROP POLICY IF EXISTS "Signed-in read curriculum versions" ON public.curriculum_versions;
CREATE POLICY "Read published curriculum versions" ON public.curriculum_versions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR status = 'published');
DROP POLICY IF EXISTS "Signed-in read curriculum nodes" ON public.curriculum_nodes;
CREATE POLICY "Read published curriculum nodes" ON public.curriculum_nodes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.curriculum_versions v WHERE v.id = curriculum_nodes.version_id AND v.status = 'published'));
DROP POLICY IF EXISTS "Signed-in read curriculum edges" ON public.curriculum_edges;
CREATE POLICY "Read published curriculum edges" ON public.curriculum_edges FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.curriculum_versions v WHERE v.id = curriculum_edges.version_id AND v.status = 'published'));