import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LessonRun, LessonRunSetup } from "@/types/learningSession";
import { Json } from "@/integrations/supabase/types";

export function useLessonRuns() {
  const startLessonRun = useCallback(
    async (lessonNodeKey: string, difficulty: number, setup: LessonRunSetup = {}): Promise<string | null> => {
      try {
        const { data, error } = await supabase
          .from("lesson_runs")
          .insert([{
            lesson_node_key: lessonNodeKey,
            difficulty,
            setup: setup as Json,
            attempt_count: 0,
          }])
          .select("id")
          .single();

        if (error) {
          console.error("Failed to start lesson run:", error);
          return null;
        }

        return data.id;
      } catch (err) {
        console.error("Error starting lesson run:", err);
        return null;
      }
    },
    []
  );

  const updateLessonRun = useCallback(
    async (
      runId: string,
      updates: {
        evaluation?: "pass" | "close" | "fail";
        ended_at?: string;
        attempt_count?: number;
      }
    ): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from("lesson_runs")
          .update(updates)
          .eq("id", runId);

        if (error) {
          console.error("Failed to update lesson run:", error);
          return false;
        }

        return true;
      } catch (err) {
        console.error("Error updating lesson run:", err);
        return false;
      }
    },
    []
  );

  const incrementAttempts = useCallback(
    async (runId: string): Promise<boolean> => {
      try {
        // First get current count
        const { data: current, error: fetchError } = await supabase
          .from("lesson_runs")
          .select("attempt_count")
          .eq("id", runId)
          .single();

        if (fetchError) {
          console.error("Failed to fetch lesson run:", fetchError);
          return false;
        }

        const { error } = await supabase
          .from("lesson_runs")
          .update({ attempt_count: (current?.attempt_count || 0) + 1 })
          .eq("id", runId);

        if (error) {
          console.error("Failed to increment attempts:", error);
          return false;
        }

        return true;
      } catch (err) {
        console.error("Error incrementing attempts:", err);
        return false;
      }
    },
    []
  );

  const endLessonRun = useCallback(
    async (runId: string, evaluation: "pass" | "close" | "fail"): Promise<boolean> => {
      return updateLessonRun(runId, {
        evaluation,
        ended_at: new Date().toISOString(),
      });
    },
    [updateLessonRun]
  );

  const getRecentLessonRuns = useCallback(
    async (limit: number = 20): Promise<LessonRun[]> => {
      try {
        const { data, error } = await supabase
          .from("lesson_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(limit);

        if (error) {
          console.error("Failed to fetch recent lesson runs:", error);
          return [];
        }

        return (data || []).map((row) => ({
          id: row.id,
          lesson_node_key: row.lesson_node_key,
          started_at: row.started_at,
          ended_at: row.ended_at,
          evaluation: row.evaluation as "pass" | "close" | "fail" | null,
          difficulty: row.difficulty,
          setup: (row.setup || {}) as LessonRunSetup,
          attempt_count: row.attempt_count,
          created_at: row.created_at,
        }));
      } catch (err) {
        console.error("Error fetching recent lesson runs:", err);
        return [];
      }
    },
    []
  );

  const getLessonRunsForLesson = useCallback(
    async (lessonNodeKey: string, limit: number = 10): Promise<LessonRun[]> => {
      try {
        const { data, error } = await supabase
          .from("lesson_runs")
          .select("*")
          .eq("lesson_node_key", lessonNodeKey)
          .order("started_at", { ascending: false })
          .limit(limit);

        if (error) {
          console.error("Failed to fetch lesson runs for lesson:", error);
          return [];
        }

        return (data || []).map((row) => ({
          id: row.id,
          lesson_node_key: row.lesson_node_key,
          started_at: row.started_at,
          ended_at: row.ended_at,
          evaluation: row.evaluation as "pass" | "close" | "fail" | null,
          difficulty: row.difficulty,
          setup: (row.setup || {}) as LessonRunSetup,
          attempt_count: row.attempt_count,
          created_at: row.created_at,
        }));
      } catch (err) {
        console.error("Error fetching lesson runs for lesson:", err);
        return [];
      }
    },
    []
  );

  return {
    startLessonRun,
    updateLessonRun,
    incrementAttempts,
    endLessonRun,
    getRecentLessonRuns,
    getLessonRunsForLesson,
  };
}
