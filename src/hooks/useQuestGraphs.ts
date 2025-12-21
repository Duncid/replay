import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { QuestData } from '@/types/quest';
import { useToast } from '@/hooks/use-toast';

export interface QuestGraph {
  id: string;
  title: string;
  data: QuestData;
  created_at: string;
  updated_at: string;
}

export function useQuestGraphs() {
  const [questGraphs, setQuestGraphs] = useState<QuestGraph[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentGraph, setCurrentGraph] = useState<QuestGraph | null>(null);
  const { toast } = useToast();

  const fetchQuestGraphs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('quest_graphs')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      const parsed = (data || []).map(graph => ({
        ...graph,
        data: graph.data as unknown as QuestData,
      }));
      
      setQuestGraphs(parsed);
    } catch (error) {
      console.error('Error fetching quest graphs:', error);
      toast({
        title: 'Failed to load quest graphs',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const saveQuestGraph = useCallback(async (
    title: string,
    data: QuestData,
  ): Promise<QuestGraph | null> => {
    setIsLoading(true);
    try {
      const { data: inserted, error } = await supabase
        .from('quest_graphs')
        .insert([{
          title,
          data: JSON.parse(JSON.stringify(data)),
        }])
        .select()
        .single();

      if (error) throw error;
      
      const graph: QuestGraph = {
        ...inserted,
        data: inserted.data as unknown as QuestData,
      };
      
      setCurrentGraph(graph);
      setQuestGraphs(prev => [graph, ...prev]);
      
      toast({ title: 'Quest graph saved' });
      return graph;
    } catch (error) {
      console.error('Error saving quest graph:', error);
      toast({
        title: 'Failed to save quest graph',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const updateQuestGraph = useCallback(async (
    id: string,
    data: QuestData,
    title?: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const updates: Record<string, unknown> = {
        data: JSON.parse(JSON.stringify(data)),
      };
      if (title !== undefined) updates.title = title;

      const { data: updated, error } = await supabase
        .from('quest_graphs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      const graph: QuestGraph = {
        ...updated,
        data: updated.data as unknown as QuestData,
      };
      
      setCurrentGraph(graph);
      setQuestGraphs(prev => 
        prev.map(g => g.id === id ? graph : g)
      );
      
      toast({ title: 'Quest graph updated' });
      return true;
    } catch (error) {
      console.error('Error updating quest graph:', error);
      toast({
        title: 'Failed to update quest graph',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const deleteQuestGraph = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quest_graphs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setQuestGraphs(prev => prev.filter(g => g.id !== id));
      if (currentGraph?.id === id) {
        setCurrentGraph(null);
      }
      
      toast({ title: 'Quest graph deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting quest graph:', error);
      toast({
        title: 'Failed to delete quest graph',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentGraph, toast]);

  const loadQuestGraph = useCallback((graph: QuestGraph) => {
    setCurrentGraph(graph);
  }, []);

  const clearCurrentGraph = useCallback(() => {
    setCurrentGraph(null);
  }, []);

  // Fetch quest graphs on mount
  useEffect(() => {
    fetchQuestGraphs();
  }, [fetchQuestGraphs]);

  return {
    questGraphs,
    currentGraph,
    isLoading,
    saveQuestGraph,
    updateQuestGraph,
    deleteQuestGraph,
    loadQuestGraph,
    clearCurrentGraph,
    fetchQuestGraphs,
  };
}
