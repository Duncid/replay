-- Add assemblies column to tune_assets table
ALTER TABLE public.tune_assets 
ADD COLUMN IF NOT EXISTS assemblies jsonb;