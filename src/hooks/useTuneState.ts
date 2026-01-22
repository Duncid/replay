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

  // Update evaluation inline - NO phase change (continuous experience)
  const updateEvaluation = useCallback((evaluation: TuneEvaluationResponse) => {
    setState((prev) => ({
      ...prev,
      lastEvaluation: evaluation,
      currentStreak: evaluation.currentStreak,
      // Stay in practicing phase - no transition
    }));
  }, []);

  // Clear last evaluation (e.g., after showing inline feedback)
  const clearEvaluation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastEvaluation: null,
    }));
  }, []);

  const nextNugget = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.practicePlan.length) {
        // Signal plan exhausted - trigger regeneration by returning to loading phase
        return {
          ...prev,
          phase: "loading",
          currentIndex: 0,
          currentStreak: 0,
          lastEvaluation: null,
          practicePlan: [], // Clear old plan to signal regeneration
        };
      }
      return {
        ...prev,
        currentIndex: nextIndex,
        currentStreak: 0,
        lastEvaluation: null,
      };
    });
  }, []);

  const previousNugget = useCallback(() => {
    setState((prev) => {
      const previousIndex = Math.max(0, prev.currentIndex - 1);
      if (previousIndex === prev.currentIndex) {
        return prev;
      }
      return {
        ...prev,
        currentIndex: previousIndex,
        currentStreak: 0,
        lastEvaluation: null,
      };
    });
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
    updateEvaluation,
    clearEvaluation,
    nextNugget,
    previousNugget,
    setError,
    reset,
  };
}
