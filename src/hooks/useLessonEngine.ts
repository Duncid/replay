import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
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
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { SkillToUnlock } from "@/components/LessonCard";
import {
  fetchSkillStatus,
  fetchSkillTitle,
} from "@/services/lessonService";
import {
  getSequenceHistory,
  addSequenceToHistory,
  clearSequenceHistory,
} from "@/utils/lessonSequenceHistory";

// A single LLM call captured for debug: the prompt sent and the response received
export interface DebugLLMCall {
  /** The full prompt sent to the LLM */
  request?: string;
  /** JSON-stringified LLM response */
  response?: string;
}

// Debug data captured for the debug dropdown (non-blocking)
export interface LessonDebugInfo {
  /** Teacher greeting / lesson selection LLM call */
  teacherSelection?: DebugLLMCall;
  /** Lesson generation LLM call */
  lessonGeneration?: DebugLLMCall;
  /** Evaluation LLM call */
  evaluation?: DebugLLMCall;
}

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
  setEvaluationState: React.Dispatch<React.SetStateAction<EvaluationState>>;
  setShowEvaluationScreen: (show: boolean) => void;
  setDebugInfo: React.Dispatch<React.SetStateAction<LessonDebugInfo>>;
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
    state.setDebugInfo({});
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
          lessonRunId: lesson.lessonRunId,
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
        const newSequence = lessonStartData.demoSequence || lesson.targetSequence;
        state.updateLesson({
          targetSequence: newSequence,
          instruction: lessonStartData.instruction,
          lessonRunId: lessonStartData.lessonRunId,
          trackKey: lessonStartData.lessonBrief.trackKey,
          trackTitle: lessonStartData.lessonBrief.trackTitle,
          awardedSkills: lessonStartData.lessonBrief.awardedSkills || [],
          difficulty: lessonStartData.difficulty ?? lesson.difficulty,
        });

        // Store the new sequence in history
        if (newSequence && newSequence.notes.length > 0) {
          addSequenceToHistory(lesson.lessonNodeKey, newSequence);
        }

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
        setTimeout(() => callbacks.onPlaySequence(newSequence), 500);
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
      state.setLessonState((prev) => ({ ...prev, lastComment: null }));

      try {
        // Get sequence history for this lesson
        const sequenceHistory = getSequenceHistory(lessonNodeKey);

        // CURRICULUM LESSON: Use lesson-start
        // Call mutateAsync first - it sets isPending immediately, making isLoading true
        // The render logic will show loading spinner when isLoading is true (even if debugState is still set)
        // Then clear debugState after mutation starts to ensure clean transition
        const lessonStartData = await mutations.startCurriculumLesson.mutateAsync({
          lessonKey: lessonNodeKey,
          language: options.language,
          localUserId: options.localUserId,
          debug: false,
          difficulty: difficulty,
          sequenceHistory,
        });

        // Check if user performed a new action (React Query handles request cancellation)
        if (state.userActionTokenRef.current !== actionToken) {
          return;
        }

        // Type guard for debug mode response
        if ("prompt" in lessonStartData) {
          throw new Error("Unexpected debug response in non-debug mode");
        }

        // In debug mode, save the response for the debug sheet
        if (options.debugMode) {
          state.setDebugInfo((prev) => ({
            ...prev,
            lessonGeneration: {
              ...prev.lessonGeneration,
              response: JSON.stringify(lessonStartData, null, 2),
            },
          }));
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

        // Store the new sequence in history
        if (targetSequence && targetSequence.notes.length > 0) {
          addSequenceToHistory(lessonNodeKey, targetSequence);
        }

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

          // In debug mode, save the response for the debug sheet
          if (options.debugMode) {
            state.setDebugInfo((prev) => ({
              ...prev,
              evaluation: {
                ...prev.evaluation,
                response: JSON.stringify(evaluationOutput, null, 2),
              },
            }));
          }

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

            // Celebratory toasts are shown after we fetch skill titles (below)
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
            
          // Celebratory toast for skill unlocks
            const skillNames = awardedSkillsWithTitles.map(s => s.title).join(", ");
            sonnerToast.success(`Skill Unlocked: ${skillNames}`);
          }

          // Celebratory toast for lesson acquisition
          if (evaluationOutput.markLessonAcquired) {
            const lessonTitle = state.lessonState.lesson.trackTitle || state.lessonState.lesson.lessonNodeKey || "this lesson";
            sonnerToast.success(`Lesson Acquired: ${lessonTitle}`);
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

          // Show evaluation screen
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

  // Trigger evaluation -- always proceeds immediately.
  // In debug mode, fires a parallel debug=true call to capture the prompt for the dropdown.
  const evaluateAttempt = useCallback(
    async (userSequence: NoteSequence) => {
      // In debug mode, fire a parallel call to capture the prompt (non-blocking)
      if (options.debugMode) {
        const { lesson } = state.lessonState;
        mutations.evaluateStructuredLesson.mutateAsync({
          lessonRunId: lesson.lessonRunId,
          userSequence,
          metronomeContext: {
            bpm: options.metronomeBpm,
            meter: options.metronomeTimeSignature,
          },
          localUserId: options.localUserId,
          debug: true,
        }).then((debugResponse) => {
          if ('prompt' in debugResponse) {
            state.setDebugInfo((prev) => ({
              ...prev,
              evaluation: {
                ...prev.evaluation,
                request: debugResponse.prompt,
              },
            }));
          }
        }).catch((error) => {
          console.error("Failed to get debug prompt:", error);
        });
      }

      // Always proceed directly with evaluation
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

    // Calculate new difficulty (min 1)
    const newDifficulty = Math.max(1, lesson.difficulty - 1);

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

      regenerateLessonWithNewSettings(newBpm, newMeter, newDifficulty);
    } else {
      // Always use regenerateLessonWithNewSettings to update existing lesson run
      // Use current metronome settings with decremented difficulty
      regenerateLessonWithNewSettings(
        options.metronomeBpm,
        options.metronomeTimeSignature,
        newDifficulty
      );
    }

    state.setEvaluationResult(null);
    state.setLessonState((prev) => ({ ...prev, lastComment: null }));
    state.setEvaluationState(null);
    state.hasEvaluatedRef.current = false;
  }, [state, options, callbacks, regenerateLessonWithNewSettings]);

  // Make lesson harder (for positive evaluation results)
  const handleMakeHarder = useCallback(() => {
    const { lesson } = state.lessonState;
    if (!lesson.lessonRunId) return;

    // Calculate new difficulty (max 6)
    const newDifficulty = Math.min(6, lesson.difficulty + 1);

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

      regenerateLessonWithNewSettings(newBpm, newMeter, newDifficulty);
    } else {
      // Always use regenerateLessonWithNewSettings to update existing lesson run
      // Use current metronome settings with incremented difficulty
      regenerateLessonWithNewSettings(
        options.metronomeBpm,
        options.metronomeTimeSignature,
        newDifficulty
      );
    }

    state.setEvaluationResult(null);
    state.setLessonState((prev) => ({ ...prev, lastComment: null }));
    state.setEvaluationState(null);
    state.hasEvaluatedRef.current = false;
  }, [state, options, callbacks, regenerateLessonWithNewSettings]);

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

