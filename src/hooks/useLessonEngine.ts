import { useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { UseMutationResult } from "@tanstack/react-query";
import {
  LessonStateGroup,
  ModeStateGroup,
} from "@/hooks/useLessonState";
import {
  LessonMetronomeSettings,
  LessonBrief,
  LessonState,
  EvaluationOutput,
  CoachOutput,
  TeacherSuggestion,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { SkillToUnlock } from "@/components/LessonCard";
import {
  fetchSkillStatus,
  fetchSkillTitle,
} from "@/services/lessonService";

// Types for debug and evaluation state
export type DebugState =
  | {
      type: "lesson";
      suggestion: TeacherSuggestion;
      prompt: string;
    }
  | {
      type: "evaluation";
      prompt: string;
      userSequence: NoteSequence;
      evaluationType: "structured" | "free";
      pendingCall: () => Promise<void>;
      decidePrompt?: string;
    }
  | null;

// EvaluationState now uses combined EvaluationOutput
export type EvaluationState =
  | {
      type: "structured";
      evaluationOutput: EvaluationOutput;
      awardedSkillsWithTitles?: SkillToUnlock[];
    }
  | {
      type: "free";
      freePracticeEvaluation: {
        evaluation: "correct" | "close" | "wrong";
        feedback: string;
      };
    }
  | null;

export interface LessonEngineCallbacks {
  onPlaySequence: (sequence: NoteSequence) => void;
  onClearRecording: () => void;
  applyMetronomeSettings: (settings: LessonMetronomeSettings) => void;
  setMetronomeBpm?: (bpm: number) => void;
  setMetronomeTimeSignature?: (ts: string) => void;
}

export interface LessonEngineState {
  lessonState: LessonStateGroup;
  setLessonState: React.Dispatch<React.SetStateAction<LessonStateGroup>>;
  updateLesson: (updates: Partial<LessonState>) => void;
  resetLesson: () => void;
  modeState: ModeStateGroup;
  setMode: (mode: "practice" | "evaluation") => void;
  setEvaluationResult: (result: "positive" | "negative" | null) => void;
  setSkillToUnlock: (skill: SkillToUnlock | null) => void;
  setDebugState: React.Dispatch<React.SetStateAction<DebugState>>;
  setEvaluationState: React.Dispatch<React.SetStateAction<EvaluationState>>;
  setShowEvaluationScreen: (show: boolean) => void;
  debugState: DebugState;
  evaluationState: EvaluationState;
  hasEvaluatedRef: React.MutableRefObject<boolean>;
  userActionTokenRef: React.MutableRefObject<string>;
}

// Generic mutation type for lesson engine
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMutation = UseMutationResult<any, Error, any, unknown>;

export interface LessonEngineMutations {
  startCurriculumLesson: AnyMutation;
  regenerateCurriculumLesson: AnyMutation;
  evaluateStructuredLesson: AnyMutation;
}

export function useLessonEngine(
  state: LessonEngineState,
  callbacks: LessonEngineCallbacks,
  mutations: LessonEngineMutations,
  options: {
    language: string;
    model: string;
    debugMode: boolean;
    metronomeBpm: number;
    metronomeTimeSignature: string;
    localUserId?: string | null;
  }
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const markUserAction = useCallback(() => {
    state.userActionTokenRef.current = crypto.randomUUID();
    state.hasEvaluatedRef.current = false;
    state.setLessonState((prev) => ({ ...prev, isEvaluating: false }));
    state.setSkillToUnlock(null);
    state.setEvaluationState(null);
    state.setDebugState(null);
  }, [state]);

  // Regenerate demo sequence with new BPM/meter settings (and optionally new difficulty)
  const regenerateLessonWithNewSettings = useCallback(
    async (newBpm: number, newMeter: string, newDifficulty?: number) => {
      const { lesson } = state.lessonState;
      if (!lesson.lessonRunId || !lesson.lessonNodeKey || lesson.targetSequence.notes.length === 0)
        return;

      try {
        // CURRICULUM LESSON: Use lesson-start with setup overrides
        const lessonStartData = await mutations.regenerateCurriculumLesson.mutateAsync({
          lessonKey: lesson.lessonNodeKey,
          language: options.language,
          localUserId: options.localUserId,
          setupOverrides: {
            bpm: newBpm,
            meter: newMeter,
          },
          difficulty: newDifficulty,
        });

        // Apply metronome settings from the response
        if (lessonStartData.metronome) {
          callbacks.applyMetronomeSettings(lessonStartData.metronome);
        }

        // Update the lesson with the new data
        state.updateLesson({
          targetSequence: lessonStartData.demoSequence || lesson.targetSequence,
          instruction: lessonStartData.instruction,
          lessonRunId: lessonStartData.lessonRunId,
          trackKey: lessonStartData.lessonBrief.trackKey,
          trackTitle: lessonStartData.lessonBrief.trackTitle,
          awardedSkills: lessonStartData.lessonBrief.awardedSkills || [],
          difficulty: lessonStartData.difficulty ?? lesson.difficulty,
        });

        // Update skill unlock status if there are awarded skills
        if (lessonStartData.lessonBrief.awardedSkills && lessonStartData.lessonBrief.awardedSkills.length > 0) {
          const skillKey = lessonStartData.lessonBrief.awardedSkills[0];
          const skillTitle = await fetchSkillTitle(skillKey);
          const status = await fetchSkillStatus(skillKey, skillTitle, options.localUserId);
          if (status) {
            state.setSkillToUnlock(status);
          }
        }

        // Reset evaluation state when regenerating
        state.setEvaluationResult(null);
        state.setLessonState((prev) => ({ ...prev, lastComment: null }));

        // Reset to practice mode when regenerating lesson
        state.setMode("practice");
        state.hasEvaluatedRef.current = false;

        // Play the new example
        setTimeout(() => callbacks.onPlaySequence(lessonStartData.demoSequence || lesson.targetSequence), 500);
      } catch (err) {
        console.error("Failed to regenerate lesson:", err);
        toast({
          title: "Error",
          description: "Failed to regenerate lesson with new settings",
          variant: "destructive",
        });
      }
    },
    [
      state,
      callbacks,
      options,
      mutations,
      toast,
    ]
  );

  // Generate a new lesson
  const generateLesson = useCallback(
    async (
      userPrompt: string,
      difficulty: number = 1,
      previousSequence: NoteSequence | undefined,
      lessonNodeKey: string
    ) => {
      markUserAction();
      const actionToken = state.userActionTokenRef.current;
      // Clear debug state first, then set loading to ensure spinner shows
      state.setDebugState(null);
      state.setLessonState((prev) => ({ ...prev, lastComment: null }));

      try {
        // CURRICULUM LESSON: Use lesson-start
        const lessonStartData = await mutations.startCurriculumLesson.mutateAsync({
          lessonKey: lessonNodeKey,
          language: options.language,
          localUserId: options.localUserId,
          debug: false,
          difficulty: difficulty,
        });

        // Check if user performed a new action (React Query handles request cancellation)
        if (state.userActionTokenRef.current !== actionToken) return;

        // Type guard for debug mode response
        if ("prompt" in lessonStartData) {
          throw new Error("Unexpected debug response in non-debug mode");
        }

        const lessonRunId = lessonStartData.lessonRunId;
        const instruction = lessonStartData.instruction;
        const targetSequence = lessonStartData.demoSequence || { notes: [], totalTime: 0 };
        const lessonBrief = lessonStartData.lessonBrief;
        const metronomeSettings = lessonStartData.metronome;
        const trackKey = lessonBrief.trackKey;
        const trackTitle = lessonBrief.trackTitle;
        const awardedSkills = lessonBrief.awardedSkills || [];
        const lessonDifficulty = lessonStartData.difficulty ?? difficulty;

        // Apply metronome settings from the response
        if (metronomeSettings) {
          callbacks.applyMetronomeSettings(metronomeSettings);
        }

        // Fetch skill status for the first awarded skill
        if (awardedSkills.length > 0) {
          const skillTitle = await fetchSkillTitle(awardedSkills[0]);
          const status = await fetchSkillStatus(awardedSkills[0], skillTitle, options.localUserId);
          state.setSkillToUnlock(status);
        } else {
          state.setSkillToUnlock(null);
        }

        state.updateLesson({
          instruction,
          targetSequence,
          phase: "your_turn",
          attempts: 0,
          validations: 0,
          feedback: null,
          difficulty: lessonDifficulty,
          userPrompt,
          lessonNodeKey,
          lessonRunId,
          trackKey,
          trackTitle,
          awardedSkills,
        });

        // Reset to practice mode when starting a new lesson
        state.setMode("practice");
        state.setEvaluationResult(null);
        state.hasEvaluatedRef.current = false;
        callbacks.onClearRecording();

        // Automatically play the demo
        setTimeout(() => callbacks.onPlaySequence(targetSequence), 500);
      } catch (error) {
        console.error("Failed to generate lesson:", error);
        toast({
          title: t("learnMode.generateErrorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("learnMode.generateErrorDescription"),
          variant: "destructive",
        });
        // On error, return to practice plan screen (welcome phase)
        state.resetLesson();
        state.setLessonState((prev) => ({ ...prev, prompt: "", lastComment: null }));
        state.setDebugState(null);
        state.setMode("practice");
        state.setEvaluationResult(null);
        callbacks.onClearRecording();
      }
    },
    [
      state,
      callbacks,
      options,
      markUserAction,
      mutations,
      toast,
      t,
    ]
  );

  // Execute evaluation after debug approval
  const executeEvaluation = useCallback(
    async (
      userSequence: NoteSequence
    ) => {
      console.log("executeEvaluation called", { 
        userSequenceLength: userSequence.notes.length,
        lessonRunId: state.lessonState.lesson.lessonRunId 
      });
      const { lesson } = state.lessonState;
      const actionToken = state.userActionTokenRef.current;
      state.setLessonState((prev) => ({ ...prev, isEvaluating: true }));
      state.setDebugState(null);
      state.setEvaluationState(null);

      try {
        // STRUCTURED LESSON: Use merged lesson-evaluate endpoint
        if (lesson.lessonRunId) {
          // Call merged lesson-evaluate (returns combined grader + coach output)
          const evaluationOutput = await mutations.evaluateStructuredLesson.mutateAsync({
            lessonRunId: lesson.lessonRunId,
            userSequence,
            metronomeContext: {
              bpm: options.metronomeBpm,
              meter: options.metronomeTimeSignature,
            },
            localUserId: options.localUserId,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (state.userActionTokenRef.current !== actionToken) return;

          // Store evaluation output
          state.setEvaluationState({
            type: "structured",
            evaluationOutput,
          });

          // Debug mode: toast evaluation results
          if (options.debugMode) {
            const evalEmoji =
              evaluationOutput.evaluation === "pass"
                ? "✅"
                : evaluationOutput.evaluation === "close"
                ? "⚠️"
                : "❌";
            const evalLabel =
              evaluationOutput.evaluation === "pass"
                ? "Pass"
                : evaluationOutput.evaluation === "close"
                ? "Close"
                : "Fail";
            toast({
              title: `${evalEmoji} Evaluation: ${evalLabel}`,
              description: evaluationOutput.diagnosis?.join(", ") || evaluationOutput.feedbackText,
            });

            toast({
              title: `🎯 Coach: ${evaluationOutput.nextAction}`,
              description: evaluationOutput.setupDelta
                ? `Setup: ${JSON.stringify(evaluationOutput.setupDelta)}`
                : undefined,
            });

            if (evaluationOutput.awardedSkills && evaluationOutput.awardedSkills.length > 0) {
              toast({
                title: `🏆 Skills Awarded`,
                description: evaluationOutput.awardedSkills.join(", "),
              });
            }
          }

          // Update skill unlock status if skills were awarded
          let skillUnlockStatus = null;
          let awardedSkillsWithTitles: SkillToUnlock[] = [];
          
          if (evaluationOutput.awardedSkills && evaluationOutput.awardedSkills.length > 0) {
            // Fetch titles for all awarded skills
            awardedSkillsWithTitles = await Promise.all(
              evaluationOutput.awardedSkills.map(async (skillKey) => {
                const skillTitle = await fetchSkillTitle(skillKey);
                const status = await fetchSkillStatus(skillKey, skillTitle, options.localUserId);
                return { 
                  skillKey, 
                  title: skillTitle, 
                  isUnlocked: true 
                };
              })
            );
            
            // Set the first skill as the primary skill to unlock (for backward compatibility)
            if (awardedSkillsWithTitles.length > 0) {
              skillUnlockStatus = awardedSkillsWithTitles[0];
            }
          }

          // Determine evaluation result based on evaluation
          const isPositive = evaluationOutput.evaluation === "pass";
          
          // Update all state together (skills, evaluation result, feedback, attempts)
          if (skillUnlockStatus) {
            state.setSkillToUnlock(skillUnlockStatus);
          }
          state.setEvaluationResult(isPositive ? "positive" : "negative");
          state.setLessonState((prev) => ({
            ...prev,
            lastComment: evaluationOutput.feedbackText,
            lesson: { ...prev.lesson, attempts: prev.lesson.attempts + 1 },
          }));

          // Update evaluation state with awarded skills (including titles)
          state.setEvaluationState({
            type: "structured",
            evaluationOutput,
            awardedSkillsWithTitles,
          });

          // Show evaluation screen instead of immediately returning to practice
          console.log("executeEvaluation: Setting showEvaluationScreen to true");
          state.setShowEvaluationScreen(true);
          console.log("executeEvaluation: Evaluation complete, screen should show");
        } else {
          throw new Error("Lesson run ID is required for evaluation");
        }
      } catch (error) {
        console.error("Failed to evaluate attempt:", error);
        state.setLessonState((prev) => ({
          ...prev,
          lastComment: t("learnMode.evaluationFallback"),
          isEvaluating: false,
        }));
        // Clear debug state on error
        state.setDebugState(null);
        // Don't show evaluation screen on error - return to practice mode
        state.setMode("practice");
      } finally {
        state.hasEvaluatedRef.current = false;
        // Ensure isEvaluating is always reset
        state.setLessonState((prev) => ({ ...prev, isEvaluating: false }));
        callbacks.onClearRecording();
      }
    },
    [
      state,
      callbacks,
      options,
      mutations,
      toast,
      t,
    ]
  );

  // Trigger evaluation (with debug mode support)
  const evaluateAttempt = useCallback(
    async (userSequence: NoteSequence) => {
      const { lesson } = state.lessonState;
      
      // In debug mode, fetch full prompt from edge function first
      if (options.debugMode) {
        try {
          // Call edge function with debug=true to get the full LLM prompt
          const debugResponse = await mutations.evaluateStructuredLesson.mutateAsync({
            lessonRunId: lesson.lessonRunId,
            userSequence,
            metronomeContext: {
              bpm: options.metronomeBpm,
              meter: options.metronomeTimeSignature,
            },
            localUserId: options.localUserId,
            debug: true,
          });

          // Type guard: debug response has 'prompt' field
          if ('prompt' in debugResponse) {
            // Show debug card with full LLM prompt from edge function
            state.setDebugState({
              type: "evaluation",
              prompt: debugResponse.prompt,
              userSequence,
              evaluationType: "structured",
              pendingCall: () => executeEvaluation(userSequence),
            });
            return;
          }
        } catch (error) {
          console.error("Failed to get debug prompt:", error);
          // Fall through to normal execution
        }
      }

      // Normal mode or debug failed - proceed directly
      await executeEvaluation(userSequence);
    },
    [
      state,
      options,
      executeEvaluation,
      mutations,
    ]
  );

  // Make lesson easier (for negative evaluation results)
  const handleMakeEasier = useCallback(() => {
    const { lesson } = state.lessonState;
    if (!lesson.lessonRunId) return;

    // Use the evaluation's suggested adjustment if available
    const evalOutput = state.evaluationState?.type === "structured" ? state.evaluationState.evaluationOutput : undefined;
    if (evalOutput?.setupDelta) {
      const newBpm = evalOutput.setupDelta.bpm ?? options.metronomeBpm;
      const newMeter = evalOutput.setupDelta.meter ?? options.metronomeTimeSignature;

      if (evalOutput.setupDelta.bpm && callbacks.setMetronomeBpm) {
        callbacks.setMetronomeBpm(evalOutput.setupDelta.bpm);
      }
      if (evalOutput.setupDelta.meter && callbacks.setMetronomeTimeSignature) {
        callbacks.setMetronomeTimeSignature(evalOutput.setupDelta.meter);
      }

      regenerateLessonWithNewSettings(newBpm, newMeter, Math.max(1, lesson.difficulty - 1));
    } else {
      // Fallback: reduce difficulty and regenerate
      generateLesson(
        lesson.userPrompt,
        Math.max(1, lesson.difficulty - 1),
        lesson.targetSequence,
        lesson.lessonNodeKey
      );
    }

    state.setEvaluationResult(null);
    state.setLessonState((prev) => ({ ...prev, lastComment: null }));
    state.setEvaluationState(null);
    state.hasEvaluatedRef.current = false;
  }, [state, options, callbacks, regenerateLessonWithNewSettings, generateLesson]);

  // Make lesson harder (for positive evaluation results)
  const handleMakeHarder = useCallback(() => {
    const { lesson } = state.lessonState;
    if (!lesson.lessonRunId) return;

    // Use the evaluation's suggested adjustment if available
    const evalOutput = state.evaluationState?.type === "structured" ? state.evaluationState.evaluationOutput : undefined;
    if (evalOutput?.setupDelta) {
      const newBpm = evalOutput.setupDelta.bpm ?? options.metronomeBpm;
      const newMeter = evalOutput.setupDelta.meter ?? options.metronomeTimeSignature;

      if (evalOutput.setupDelta.bpm && callbacks.setMetronomeBpm) {
        callbacks.setMetronomeBpm(evalOutput.setupDelta.bpm);
      }
      if (evalOutput.setupDelta.meter && callbacks.setMetronomeTimeSignature) {
        callbacks.setMetronomeTimeSignature(evalOutput.setupDelta.meter);
      }

      regenerateLessonWithNewSettings(newBpm, newMeter, lesson.difficulty + 1);
    } else {
      // Fallback: increase difficulty and regenerate
      generateLesson(
        lesson.userPrompt,
        lesson.difficulty + 1,
        lesson.targetSequence,
        lesson.lessonNodeKey
      );
    }

    state.setEvaluationResult(null);
    state.setLessonState((prev) => ({ ...prev, lastComment: null }));
    state.setEvaluationState(null);
    state.hasEvaluatedRef.current = false;
  }, [state, options, callbacks, regenerateLessonWithNewSettings, generateLesson]);

  return {
    generateLesson,
    regenerateLessonWithNewSettings,
    executeEvaluation,
    evaluateAttempt,
    handleMakeEasier,
    handleMakeHarder,
    markUserAction,
  };
}

