-- Keep composition ownership and require an admin role for every operation.
ALTER POLICY "Owners manage compositions" ON public.compositions
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));
