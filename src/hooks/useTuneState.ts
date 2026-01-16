import { useState, useCallback } from "react";
import type { 
  TunePracticeState, 
  PracticePlanItem, 
  TuneEvaluationResponse 
} from "@/types/tunePractice";

const initialState: TunePracticeState = {
  phase: "loading",
  tuneKey: "",
  tuneTitle: "",
  practicePlan: [],
  currentIndex: 0,
  currentStreak: 0,
  lastEvaluation: null,
  error: null,
};

export function useTuneState(tuneKey: string) {
  const [state, setState] = useState<TunePracticeState>({
    ...initialState,
    tuneKey,
  });

  const setPhase = useCallback((phase: TunePracticeState["phase"]) => {
    setState((prev) => ({ ...prev, phase }));
  }, []);

  const setPracticePlan = useCallback((
    practicePlan: PracticePlanItem[],
    tuneTitle: string
  ) => {
    setState((prev) => ({
      ...prev,
      practicePlan,
      tuneTitle,
      currentIndex: 0,
      phase: "practicing",
    }));
  }, []);

  const setEvaluation = useCallback((evaluation: TuneEvaluationResponse) => {
    setState((prev) => ({
      ...prev,
      lastEvaluation: evaluation,
      currentStreak: evaluation.currentStreak,
      phase: "feedback",
    }));
  }, []);

  const nextNugget = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.practicePlan.length) {
        // End of practice plan
        return { ...prev, phase: "coaching" };
      }
      return {
        ...prev,
        currentIndex: nextIndex,
        lastEvaluation: null,
        phase: "practicing",
      };
    });
  }, []);

  const retryCurrentNugget = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastEvaluation: null,
      phase: "practicing",
    }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...initialState, tuneKey });
  }, [tuneKey]);

  const currentNugget = state.practicePlan[state.currentIndex] || null;

  return {
    state,
    currentNugget,
    setPhase,
    setPracticePlan,
    setEvaluation,
    nextNugget,
    retryCurrentNugget,
    setError,
    reset,
  };
}
