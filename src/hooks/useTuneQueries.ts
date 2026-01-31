import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TuneCoachResponse, TuneEvaluationResponse } from "@/types/tunePractice";
import type { TuneAssetData, TuneBriefing } from "@/types/tuneAssets";

interface StartTunePracticeParams {
  tuneKey: string;
  localUserId?: string | null;
  language?: string;
  debug?: boolean;
}

interface EvaluateTuneAttemptParams {
  tuneKey: string;
  nuggetId: string;
  userSequence: unknown;
  localUserId?: string | null;
  language?: string;
  debug?: boolean;
  evalIndex?: number;
}

export function useStartTunePractice() {
  return useMutation({
    mutationFn: async (params: StartTunePracticeParams): Promise<TuneCoachResponse> => {
      const { data, error } = await supabase.functions.invoke("tune-coach", {
        body: {
          tuneKey: params.tuneKey,
          localUserId: params.localUserId,
          language: params.language || "en",
          debug: params.debug || false,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to start tune practice");
      }

      return data as TuneCoachResponse;
    },
  });
}

export function useEvaluateTuneAttempt() {
  return useMutation({
    mutationFn: async (params: EvaluateTuneAttemptParams): Promise<TuneEvaluationResponse> => {
      const { data, error } = await supabase.functions.invoke("tune-evaluate", {
        body: {
          tuneKey: params.tuneKey,
          nuggetId: params.nuggetId,
          userSequence: params.userSequence,
          localUserId: params.localUserId,
          language: params.language || "en",
          debug: params.debug || false,
          evalIndex: params.evalIndex,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to evaluate tune attempt");
      }

      return data as TuneEvaluationResponse;
    },
  });
}

export function useTuneAssets(tuneKey: string | null) {
  return useQuery({
    queryKey: ["tune-assets", tuneKey],
    queryFn: async (): Promise<TuneAssetData | null> => {
      if (!tuneKey) return null;

      // Query tune_assets joined with curriculum_versions
      // to get the most recently published version
      const { data, error } = await supabase
        .from("tune_assets")
        .select(`
          *,
          curriculum_versions!inner (
            status,
            published_at
          )
        `)
        .eq("tune_key", tuneKey)
        .eq("curriculum_versions.status", "published")
        .order("curriculum_versions(published_at)", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data as unknown as TuneAssetData | null;
    },
    enabled: !!tuneKey,
  });
}

interface PublishedTuneInfo {
  tune_key: string;
  briefing: TuneBriefing | null;
}

export function usePublishedTuneKeys() {
  return useQuery({
    queryKey: ["published-tune-keys"],
    queryFn: async (): Promise<PublishedTuneInfo[]> => {
      const { data, error } = await supabase
        .from("tune_assets")
        .select(`
          tune_key,
          briefing,
          curriculum_versions!inner (
            status,
            published_at
          )
        `)
        .eq("curriculum_versions.status", "published")
        .order("curriculum_versions(published_at)", { ascending: false });

      if (error) throw new Error(error.message);

      // Dedupe by tune_key (take the most recent published)
      const seen = new Set<string>();
      return (data ?? []).filter(item => {
        if (seen.has(item.tune_key)) return false;
        seen.add(item.tune_key);
        return true;
      }).map(item => ({
        tune_key: item.tune_key,
        briefing: item.briefing as TuneBriefing | null,
      }));
    },
  });
}
