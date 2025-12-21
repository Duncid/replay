-- Create quest_graphs table for storing quest graph data
CREATE TABLE public.quest_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quest_graphs ENABLE ROW LEVEL SECURITY;

-- Public access policies (matching compositions pattern)
CREATE POLICY "Allow public read" ON public.quest_graphs FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.quest_graphs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.quest_graphs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.quest_graphs FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_quest_graphs_updated_at
  BEFORE UPDATE ON public.quest_graphs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();