-- Create tune_assets table to store published tune data
CREATE TABLE tune_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  tune_key TEXT NOT NULL,
  briefing JSONB,
  note_sequence JSONB NOT NULL,
  left_hand_sequence JSONB,
  right_hand_sequence JSONB,
  nuggets JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_id, tune_key)
);

-- Enable RLS
ALTER TABLE tune_assets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (same pattern as other curriculum tables)
CREATE POLICY "Allow public read tune_assets" ON tune_assets FOR SELECT USING (true);
CREATE POLICY "Allow public insert tune_assets" ON tune_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete tune_assets" ON tune_assets FOR DELETE USING (true);