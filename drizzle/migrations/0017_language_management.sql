CREATE TABLE public.language_settings (
  locale text PRIMARY KEY CHECK (locale ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'),
  notation text NOT NULL DEFAULT 'abc' CHECK (notation IN ('abc','solfege')),
  date_order text NOT NULL DEFAULT 'MDY' CHECK (date_order IN ('MDY','DMY','YMD')),
  hour_cycle text NOT NULL DEFAULT 'h12' CHECK (hour_cycle IN ('h12','h23'))
);
INSERT INTO public.language_settings VALUES
  ('en-US','abc','MDY','h12'), ('en-GB','abc','DMY','h23'), ('fr-FR','solfege','DMY','h23');

CREATE TABLE public.language_strings (
  locale text NOT NULL REFERENCES public.language_settings(locale),
  kind text NOT NULL CHECK (kind IN ('ui','tune')),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 512),
  value text NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 8000),
  PRIMARY KEY (locale,kind,key)
);

ALTER TABLE public.language_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_strings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.language_settings, public.language_strings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.language_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.language_strings TO authenticated;
CREATE POLICY language_settings_read ON public.language_settings FOR SELECT USING (true);
CREATE POLICY language_settings_admin ON public.language_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY language_strings_read ON public.language_strings FOR SELECT USING (true);
CREATE POLICY language_strings_admin ON public.language_strings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
