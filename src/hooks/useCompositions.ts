import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayEntry } from '@/components/modes/PlayMode';
import { useToast } from '@/hooks/use-toast';

export interface Composition {
  id: string;
  title: string;
  data: PlayEntry[];
  instrument: string | null;
  bpm: number | null;
  time_signature: string | null;
  created_at: string;
  updated_at: string;
}

interface UseCompositionsOptions {
  onLoad?: (composition: Composition) => void;
}

export function useCompositions(options: UseCompositionsOptions = {}) {
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentComposition, setCurrentComposition] = useState<Composition | null>(null);
  const { toast } = useToast();

  const fetchCompositions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('compositions')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Parse JSONB data field
      const parsed = (data || []).map(comp => ({
        ...comp,
        data: comp.data as unknown as PlayEntry[],
      }));
      
      setCompositions(parsed);
    } catch (error) {
      console.error('Error fetching compositions:', error);
      toast({
        title: 'Failed to load compositions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const saveComposition = useCallback(async (
    title: string,
    data: PlayEntry[],
    instrument: string,
    bpm: number,
    timeSignature: string,
  ): Promise<Composition | null> => {
    setIsLoading(true);
    try {
      const { data: inserted, error } = await supabase
        .from('compositions')
        .insert([{
          title,
          data: JSON.parse(JSON.stringify(data)),
          instrument,
          bpm,
          time_signature: timeSignature,
        }])
        .select()
        .single();

      if (error) throw error;
      
      const composition = {
        ...inserted,
        data: inserted.data as unknown as PlayEntry[],
      };
      
      setCurrentComposition(composition);
      setCompositions(prev => [composition, ...prev]);
      
      toast({ title: 'Composition saved' });
      return composition;
    } catch (error) {
      console.error('Error saving composition:', error);
      toast({
        title: 'Failed to save composition',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const updateComposition = useCallback(async (
    id: string,
    data: PlayEntry[],
    instrument?: string,
    bpm?: number,
    timeSignature?: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const updates: Record<string, unknown> = {
        data: JSON.parse(JSON.stringify(data)),
      };
      if (instrument !== undefined) updates.instrument = instrument;
      if (bpm !== undefined) updates.bpm = bpm;
      if (timeSignature !== undefined) updates.time_signature = timeSignature;

      const { data: updated, error } = await supabase
        .from('compositions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      const composition = {
        ...updated,
        data: updated.data as unknown as PlayEntry[],
      };
      
      setCurrentComposition(composition);
      setCompositions(prev => 
        prev.map(c => c.id === id ? composition : c)
      );
      
      toast({ title: 'Composition updated' });
      return true;
    } catch (error) {
      console.error('Error updating composition:', error);
      toast({
        title: 'Failed to update composition',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const deleteComposition = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('compositions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setCompositions(prev => prev.filter(c => c.id !== id));
      if (currentComposition?.id === id) {
        setCurrentComposition(null);
      }
      
      toast({ title: 'Composition deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting composition:', error);
      toast({
        title: 'Failed to delete composition',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentComposition, toast]);

  const loadComposition = useCallback((composition: Composition) => {
    setCurrentComposition(composition);
    options.onLoad?.(composition);
  }, [options]);

  const clearCurrentComposition = useCallback(() => {
    setCurrentComposition(null);
  }, []);

  // Fetch compositions on mount
  useEffect(() => {
    fetchCompositions();
  }, [fetchCompositions]);

  return {
    compositions,
    currentComposition,
    isLoading,
    saveComposition,
    updateComposition,
    deleteComposition,
    loadComposition,
    clearCurrentComposition,
    fetchCompositions,
  };
}
