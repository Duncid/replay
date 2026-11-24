ALTER TABLE public.tune_assets ADD COLUMN composer text;

CREATE OR REPLACE FUNCTION public.musicxml_composer(score text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE names text[]; result text;
BEGIN
  IF score IS NULL OR btrim(score) = '' THEN RETURN NULL; END IF;
  SELECT array_agg(DISTINCT btrim(regexp_replace((entry::text), '\s*\([0-9]{4}[^)]*\)\s*$', ''))) INTO names
  FROM unnest(xpath('/*[local-name()="score-partwise" or local-name()="score-timewise"]/*[local-name()="identification"]/*[local-name()="creator" and translate(@type,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="composer"]/text()', xmlparse(document score))) AS entry;
  SELECT string_agg(name, '; ' ORDER BY name) INTO result FROM unnest(names) AS name
  WHERE name <> '' AND lower(name) NOT IN ('music21', 'musescore', 'unknown', 'composer');
  RETURN result;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_tune_composer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.composer IS NULL OR btrim(NEW.composer) = '' THEN
    NEW.composer := public.musicxml_composer(NEW.tune_xml);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fill_tune_composer BEFORE INSERT OR UPDATE OF tune_xml, composer ON public.tune_assets
FOR EACH ROW EXECUTE FUNCTION public.fill_tune_composer();

UPDATE public.tune_assets SET composer = CASE
  WHEN tune_key = 'waltz-in-a-minor-chopin' THEN 'Frédéric Chopin'
  WHEN tune_key = 'gymnopdie' THEN 'Erik Satie'
  ELSE public.musicxml_composer(tune_xml)
END;
COMMENT ON COLUMN public.tune_assets.composer IS 'Composer credited by MusicXML metadata or explicitly supplied; null when unknown.';