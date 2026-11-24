CREATE OR REPLACE FUNCTION public.musicxml_composer(score text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE names text[]; result text;
BEGIN
  IF score IS NULL OR btrim(score) = '' THEN RETURN NULL; END IF;
  SELECT array_agg(DISTINCT btrim(regexp_replace(credit, '\s*\([0-9]{4}[^)]*\)\s*$', ''))) INTO names
  FROM XMLTABLE('/*[local-name()="score-partwise" or local-name()="score-timewise"]/*[local-name()="identification"]/*[local-name()="creator" and translate(@type,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="composer"]' PASSING xmlparse(document score) COLUMNS credit text PATH '.') AS credits;
  SELECT string_agg(name, '; ' ORDER BY name) INTO result FROM unnest(names) AS name
  WHERE name <> '' AND lower(name) NOT IN ('music21', 'musescore', 'unknown', 'composer');
  RETURN result;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;