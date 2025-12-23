-- Drop the curriculum schema and its tables (if they exist)
DROP SCHEMA IF EXISTS curriculum CASCADE;

-- Create curriculum tables in public schema
CREATE TABLE IF NOT EXISTS public.curriculum_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_graph_id UUID NOT NULL REFERENCES public.quest_graphs(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(quest_graph_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.curriculum_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE CASCADE,
    node_key TEXT NOT NULL,
    node_type TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curriculum_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE CASCADE,
    source_key TEXT NOT NULL,
    target_key TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curriculum_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all curriculum tables
ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_exports ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for now (public access)
CREATE POLICY "Allow public read curriculum_versions" ON public.curriculum_versions FOR SELECT USING (true);
CREATE POLICY "Allow public insert curriculum_versions" ON public.curriculum_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update curriculum_versions" ON public.curriculum_versions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete curriculum_versions" ON public.curriculum_versions FOR DELETE USING (true);

CREATE POLICY "Allow public read curriculum_nodes" ON public.curriculum_nodes FOR SELECT USING (true);
CREATE POLICY "Allow public insert curriculum_nodes" ON public.curriculum_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete curriculum_nodes" ON public.curriculum_nodes FOR DELETE USING (true);

CREATE POLICY "Allow public read curriculum_edges" ON public.curriculum_edges FOR SELECT USING (true);
CREATE POLICY "Allow public insert curriculum_edges" ON public.curriculum_edges FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete curriculum_edges" ON public.curriculum_edges FOR DELETE USING (true);

CREATE POLICY "Allow public read curriculum_exports" ON public.curriculum_exports FOR SELECT USING (true);
CREATE POLICY "Allow public insert curriculum_exports" ON public.curriculum_exports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete curriculum_exports" ON public.curriculum_exports FOR DELETE USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_curriculum_versions_quest_graph ON public.curriculum_versions(quest_graph_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_nodes_version ON public.curriculum_nodes(version_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_edges_version ON public.curriculum_edges(version_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_exports_version ON public.curriculum_exports(version_id);