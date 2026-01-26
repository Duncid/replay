-- Add XML storage columns to tune_assets table
ALTER TABLE tune_assets
  ADD COLUMN tune_xml text,
  ADD COLUMN nugget_xmls jsonb,
  ADD COLUMN assembly_xmls jsonb;