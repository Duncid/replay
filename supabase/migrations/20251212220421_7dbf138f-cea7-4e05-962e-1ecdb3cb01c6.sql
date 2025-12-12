-- Create compositions table for storing user compositions
CREATE TABLE public.compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  data JSONB NOT NULL,
  instrument TEXT,
  bpm INTEGER,
  time_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compositions ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (since no auth is implemented yet)
CREATE POLICY "Allow public read" ON public.compositions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.compositions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.compositions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.compositions FOR DELETE USING (true);

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_compositions_updated_at
BEFORE UPDATE ON public.compositions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();