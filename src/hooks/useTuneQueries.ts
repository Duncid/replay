import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TuneCoachResponse, TuneEvaluationResponse } from "@/types/tunePractice";

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
    queryFn: async () => {
      if (!tuneKey) return null;

      const { data, error } = await supabase
        .from("tune_assets")
        .select("*")
        .eq("tune_key", tuneKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    enabled: !!tuneKey,
  });
}
