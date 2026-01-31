-- Add DSP XML columns to tune_assets table
ALTER TABLE tune_assets
  ADD COLUMN tune_dsp_xml text,
  ADD COLUMN nugget_dsp_xmls jsonb,
  ADD COLUMN assembly_dsp_xmls jsonb;

COMMENT ON COLUMN tune_assets.tune_dsp_xml IS 'Full tune DSP MusicXML for display rendering';
COMMENT ON COLUMN tune_assets.nugget_dsp_xmls IS 'Mapping of nugget ID to DSP XML strings, including .lh/.rh variants';
COMMENT ON COLUMN tune_assets.assembly_dsp_xmls IS 'Mapping of assembly ID to DSP XML strings, including .lh/.rh variants';