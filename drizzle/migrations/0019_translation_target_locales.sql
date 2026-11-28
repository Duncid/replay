INSERT INTO public.language_settings (locale, notation, date_order, hour_cycle)
VALUES
  ('it-IT', 'solfege', 'DMY', 'h23'),
  ('es-419', 'solfege', 'DMY', 'h12'),
  ('pt-BR', 'solfege', 'DMY', 'h23'),
  ('de-DE', 'abc', 'DMY', 'h23'),
  ('nl-NL', 'abc', 'DMY', 'h23'),
  ('sv-SE', 'abc', 'YMD', 'h23'),
  ('pl-PL', 'abc', 'DMY', 'h23'),
  ('cs-CZ', 'abc', 'DMY', 'h23'),
  ('hu-HU', 'abc', 'YMD', 'h23'),
  ('ro-RO', 'solfege', 'DMY', 'h23')
ON CONFLICT (locale) DO NOTHING;
