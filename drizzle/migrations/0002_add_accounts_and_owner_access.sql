CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.local_users ADD COLUMN auth_user_id uuid DEFAULT auth.uid();
CREATE INDEX local_users_auth_user_id_idx ON public.local_users(auth_user_id);
ALTER TABLE public.compositions ADD COLUMN user_id uuid DEFAULT auth.uid();
ALTER TABLE public.quest_graphs ADD COLUMN user_id uuid DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.owns_local_user(_local_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.local_users WHERE id = _local_user_id AND auth_user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  display_name text := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Player');
  first_profile uuid;
BEGIN
  IF lower(NEW.email) = 'edouardwautier@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    UPDATE public.local_users SET auth_user_id = NEW.id WHERE auth_user_id IS NULL;
    UPDATE public.compositions SET user_id = NEW.id WHERE user_id IS NULL;
    UPDATE public.quest_graphs SET user_id = NEW.id WHERE user_id IS NULL;
    SELECT id INTO first_profile FROM public.local_users WHERE auth_user_id = NEW.id ORDER BY created_at LIMIT 1;
    IF first_profile IS NOT NULL THEN
      UPDATE public.lesson_runs SET local_user_id = first_profile WHERE local_user_id IS NULL;
      UPDATE public.practice_sessions SET local_user_id = first_profile WHERE local_user_id IS NULL;
      UPDATE public.user_skill_state SET local_user_id = first_profile WHERE local_user_id IS NULL;
      UPDATE public.user_lesson_acquisition SET local_user_id = first_profile WHERE local_user_id IS NULL;
      UPDATE public.user_tune_acquisition SET local_user_id = first_profile WHERE local_user_id IS NULL;
      UPDATE public.tune_nugget_state SET local_user_id = first_profile WHERE local_user_id IS NULL;
      UPDATE public.tune_practice_runs SET local_user_id = first_profile WHERE local_user_id IS NULL;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.local_users WHERE auth_user_id = NEW.id) THEN
    INSERT INTO public.local_users (name, auth_user_id) VALUES (display_name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN
    ('compositions','quest_graphs','curriculum_edges','curriculum_exports','curriculum_nodes','curriculum_versions','lesson_runs','local_users','practice_sessions','tune_assets','tune_nugget_state','tune_practice_runs','user_lesson_acquisition','user_skill_state','user_tune_acquisition')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

REVOKE ALL ON public.compositions, public.quest_graphs, public.curriculum_edges, public.curriculum_exports, public.curriculum_nodes, public.curriculum_versions, public.lesson_runs, public.local_users, public.practice_sessions, public.tune_assets, public.tune_nugget_state, public.tune_practice_runs, public.user_lesson_acquisition, public.user_skill_state, public.user_tune_acquisition FROM anon;
GRANT ALL ON public.compositions, public.quest_graphs, public.curriculum_edges, public.curriculum_exports, public.curriculum_nodes, public.curriculum_versions, public.lesson_runs, public.local_users, public.practice_sessions, public.tune_assets, public.tune_nugget_state, public.tune_practice_runs, public.user_lesson_acquisition, public.user_skill_state, public.user_tune_acquisition TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compositions, public.quest_graphs, public.tune_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lesson_runs, public.local_users TO authenticated;
GRANT SELECT ON public.curriculum_edges, public.curriculum_exports, public.curriculum_nodes, public.curriculum_versions, public.practice_sessions, public.tune_nugget_state, public.tune_practice_runs, public.user_lesson_acquisition, public.user_skill_state, public.user_tune_acquisition TO authenticated;

CREATE POLICY "Owners manage compositions" ON public.compositions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage quests" ON public.quest_graphs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Signed-in read tune assets" ON public.tune_assets FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins add tune assets" ON public.tune_assets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete tune assets" ON public.tune_assets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Signed-in read curriculum edges" ON public.curriculum_edges FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed-in read curriculum exports" ON public.curriculum_exports FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed-in read curriculum nodes" ON public.curriculum_nodes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed-in read curriculum versions" ON public.curriculum_versions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Owners read profiles" ON public.local_users FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Owners add profiles" ON public.local_users FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Owners rename profiles" ON public.local_users FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Owners read lesson runs" ON public.lesson_runs FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));
CREATE POLICY "Owners add lesson runs" ON public.lesson_runs FOR INSERT TO authenticated WITH CHECK (public.owns_local_user(local_user_id));
CREATE POLICY "Owners update lesson runs" ON public.lesson_runs FOR UPDATE TO authenticated USING (public.owns_local_user(local_user_id)) WITH CHECK (public.owns_local_user(local_user_id));
CREATE POLICY "Owners read practice sessions" ON public.practice_sessions FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));
CREATE POLICY "Owners read nugget state" ON public.tune_nugget_state FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));
CREATE POLICY "Owners read tune practice runs" ON public.tune_practice_runs FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));
CREATE POLICY "Owners read lesson acquisition" ON public.user_lesson_acquisition FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));
CREATE POLICY "Owners read skill state" ON public.user_skill_state FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));
CREATE POLICY "Owners read tune acquisition" ON public.user_tune_acquisition FOR SELECT TO authenticated USING (public.owns_local_user(local_user_id));