-- Expose curriculum schema to PostgREST API
-- This is done by granting usage on the schema and select/insert/update/delete on tables
-- to the authenticator role that PostgREST uses

-- Grant schema usage to authenticated and anon roles
GRANT USAGE ON SCHEMA curriculum TO anon, authenticated;

-- Grant table permissions to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum.curriculum_versions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum.curriculum_nodes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum.curriculum_edges TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum.curriculum_exports TO anon, authenticated;

-- Grant usage on sequences (for id generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA curriculum TO anon, authenticated;