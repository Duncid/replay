import { useState } from "react";
import { LessonState, createInitialLessonState } from "@/types/learningSession";
import { SkillToUnlock } from "@/components/LessonCard";

/**
 * Consolidated state management for LearnMode component
 * Groups related state variables together for better organization
 */

export interface LessonStateGroup {
  prompt: string;
  lesson: LessonState;
  lastComment: string | null;
  isEvaluating: boolean;
}

export interface ModeStateGroup {
  mode: "practice" | "evaluation";
  evaluationResult: "positive" | "negative" | null;
}

export interface UIStateGroup {
  isLoadingLessonDebug: boolean;
  shouldFetchGreeting: boolean;
}

export function useLessonState() {
  // Lesson State Group
  const [lessonState, setLessonState] = useState<LessonStateGroup>({
    prompt: "",
    lesson: createInitialLessonState(),
    lastComment: null,
    isEvaluating: false,
  });

  // Mode State Group
  const [modeState, setModeState] = useState<ModeStateGroup>({
    mode: "practice",
    evaluationResult: null,
  });

  // UI State Group
  const [uiState, setUIState] = useState<UIStateGroup>({
    isLoadingLessonDebug: false,
    shouldFetchGreeting: false,
  });

  // Skill State (kept separate but included in hook)
  const [skillToUnlock, setSkillToUnlock] = useState<SkillToUnlock | null>(null);

  // Helper functions for updating lesson state
  const updateLesson = (updates: Partial<LessonState>) => {
    setLessonState((prev) => ({
      ...prev,
      lesson: { ...prev.lesson, ...updates },
    }));
  };

  const resetLesson = () => {
    setLessonState({
      prompt: "",
      lesson: createInitialLessonState(),
      lastComment: null,
      isEvaluating: false,
    });
  };

  // Helper functions for updating mode state
  const setMode = (mode: "practice" | "evaluation") => {
    setModeState((prev) => ({ ...prev, mode }));
  };

  const setEvaluationResult = (result: "positive" | "negative" | null) => {
    setModeState((prev) => ({ ...prev, evaluationResult: result }));
  };

  // Helper functions for updating UI state
  const setLoadingLessonDebug = (loading: boolean) => {
    setUIState((prev) => ({ ...prev, isLoadingLessonDebug: loading }));
  };

  const setShouldFetchGreeting = (shouldFetch: boolean) => {
    setUIState((prev) => ({ ...prev, shouldFetchGreeting: shouldFetch }));
  };

  return {
    // Lesson state
    lessonState,
    setLessonState,
    updateLesson,
    resetLesson,
    // Mode state
    modeState,
    setModeState,
    setMode,
    setEvaluationResult,
    // UI state
    uiState,
    setUIState,
    setLoadingLessonDebug,
    setShouldFetchGreeting,
    // Skill state
    skillToUnlock,
    setSkillToUnlock,
  };
}

