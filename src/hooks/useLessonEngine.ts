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
  GraderOutput,
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

export type EvaluationState =
  | {
      type: "structured";
      graderOutput: GraderOutput;
      coachOutput?: CoachOutput & { awardedSkills?: string[] };
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
  startFreeFormLesson: AnyMutation;
  regenerateCurriculumLesson: AnyMutation;
  regenerateFreeFormLesson: AnyMutation;
  evaluateStructuredLesson: AnyMutation;
  evaluateFreeFormLesson: AnyMutation;
  decideNextAction: AnyMutation;
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

  // Regenerate demo sequence with new BPM/meter settings
  const regenerateLessonWithNewSettings = useCallback(
    async (newBpm: number, newMeter: string) => {
      const { lesson } = state.lessonState;
      if (!lesson.lessonRunId || lesson.targetSequence.notes.length === 0)
        return;

      try {
        if (lesson.lessonNodeKey) {
          // CURRICULUM LESSON: Use lesson-start with setup overrides
          const lessonStartData = await mutations.regenerateCurriculumLesson.mutateAsync({
            lessonKey: lesson.lessonNodeKey,
            language: options.language,
            setupOverrides: {
              bpm: newBpm,
              meter: newMeter,
            },
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
          });

          // Update skill unlock status if there are awarded skills
          if (lessonStartData.lessonBrief.awardedSkills && lessonStartData.lessonBrief.awardedSkills.length > 0) {
            const skillKey = lessonStartData.lessonBrief.awardedSkills[0];
            const skillTitle = await fetchSkillTitle(skillKey);
            const status = await fetchSkillStatus(skillKey, skillTitle);
            if (status) {
              state.setSkillToUnlock(status);
            }
          }

          // Reset evaluation state when regenerating
          state.setEvaluationResult(null);
          state.setLessonState((prev) => ({ ...prev, lastComment: null }));

          // Play the new example
          setTimeout(() => callbacks.onPlaySequence(lessonStartData.demoSequence || lesson.targetSequence), 500);
        } else {
          // FREE-FORM PRACTICE: Use piano-learn
          const regeneratePrompt = lesson.userPrompt || lesson.instruction;
          const localizedPrompt =
            options.language === "fr"
              ? `${regeneratePrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
              : regeneratePrompt;

          const data = await mutations.regenerateFreeFormLesson.mutateAsync({
            prompt: localizedPrompt,
            difficulty: lesson.difficulty,
            newBpm,
            newMeter,
            language: options.language,
            model: options.model,
          });

          // Apply metronome settings from the AI response
          if (data.metronome) {
            callbacks.applyMetronomeSettings(data.metronome);
          }

          // Update the lesson with the new sequence
          state.updateLesson({
            targetSequence: data.sequence,
            instruction: data.instruction,
          });

          // Reset evaluation state when regenerating
          state.setEvaluationResult(null);
          state.setLessonState((prev) => ({ ...prev, lastComment: null }));

          // Play the new example
          setTimeout(() => callbacks.onPlaySequence(data.sequence), 500);
        }
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
      previousSequence?: NoteSequence,
      lessonNodeKey?: string
    ) => {
      markUserAction();
      const actionToken = state.userActionTokenRef.current;
      // Clear debug state first, then set loading to ensure spinner shows
      state.setDebugState(null);
      state.setLessonState((prev) => ({ ...prev, lastComment: null }));

      try {
        let lessonRunId: string | undefined;
        let instruction: string;
        let targetSequence: NoteSequence;
        let trackKey: string | undefined;
        let trackTitle: string | undefined;
        let awardedSkills: string[] = [];
        let metronomeSettings: LessonMetronomeSettings | undefined;

        if (lessonNodeKey) {
          // CURRICULUM LESSON: Use lesson-start
          const lessonStartData = await mutations.startCurriculumLesson.mutateAsync({
            lessonKey: lessonNodeKey,
            language: options.language,
            debug: false,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (state.userActionTokenRef.current !== actionToken) return;

          // Type guard for debug mode response
          if ("prompt" in lessonStartData) {
            throw new Error("Unexpected debug response in non-debug mode");
          }

          lessonRunId = lessonStartData.lessonRunId;
          instruction = lessonStartData.instruction;
          targetSequence = lessonStartData.demoSequence || { notes: [], totalTime: 0 };
          const lessonBrief = lessonStartData.lessonBrief;
          metronomeSettings = lessonStartData.metronome;
          trackKey = lessonBrief.trackKey;
          trackTitle = lessonBrief.trackTitle;
          awardedSkills = lessonBrief.awardedSkills || [];

          // Apply metronome settings from the response
          if (metronomeSettings) {
            callbacks.applyMetronomeSettings(metronomeSettings);
          }

          // Fetch skill status for the first awarded skill
          if (awardedSkills.length > 0) {
            const skillTitle = await fetchSkillTitle(awardedSkills[0]);
            const status = await fetchSkillStatus(awardedSkills[0], skillTitle);
            state.setSkillToUnlock(status);
          } else {
            state.setSkillToUnlock(null);
          }
        } else {
          // FREE-FORM PRACTICE: Use piano-learn
          const localizedPrompt =
            options.language === "fr"
              ? `${userPrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
              : userPrompt;

          const data = await mutations.startFreeFormLesson.mutateAsync({
            prompt: localizedPrompt,
            difficulty,
            previousSequence,
            language: options.language,
            model: options.model,
            debug: false,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (state.userActionTokenRef.current !== actionToken) return;

          instruction = data.instruction;
          targetSequence = data.sequence;
          metronomeSettings = data.metronome;

          // Apply metronome settings from the AI response
          if (metronomeSettings) {
            callbacks.applyMetronomeSettings(metronomeSettings);
          }

          state.setSkillToUnlock(null);
        }

        state.updateLesson({
          instruction,
          targetSequence,
          phase: "your_turn",
          attempts: 0,
          validations: 0,
          feedback: null,
          difficulty,
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
      userSequence: NoteSequence,
      evaluationType: "structured" | "free"
    ) => {
      const { lesson } = state.lessonState;
      const actionToken = state.userActionTokenRef.current;
      state.setLessonState((prev) => ({ ...prev, isEvaluating: true }));
      state.setDebugState(null);
      state.setEvaluationState(null);

      try {
        // STRUCTURED LESSON: Use lesson-evaluate → lesson-decide
        if (evaluationType === "structured" && lesson.lessonRunId) {
          // Step 1: Call lesson-evaluate
          const graderOutput = await mutations.evaluateStructuredLesson.mutateAsync({
            lessonRunId: lesson.lessonRunId,
            userSequence,
            metronomeContext: {
              bpm: options.metronomeBpm,
              meter: options.metronomeTimeSignature,
            },
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (state.userActionTokenRef.current !== actionToken) return;

          // Store grader output temporarily (will be combined with coach output)
          state.setEvaluationState({
            type: "structured",
            graderOutput,
          });

          // Debug mode: toast grader evaluation
          if (options.debugMode) {
            const evalEmoji =
              graderOutput.evaluation === "pass"
                ? "✅"
                : graderOutput.evaluation === "close"
                ? "⚠️"
                : "❌";
            const evalLabel =
              graderOutput.evaluation === "pass"
                ? "Pass"
                : graderOutput.evaluation === "close"
                ? "Close"
                : "Fail";
            toast({
              title: `${evalEmoji} Grader: ${evalLabel}`,
              description:
                graderOutput.diagnosis?.join(", ") || graderOutput.feedbackText,
            });
          }

          // Step 2: Call lesson-decide with grader output
          // In debug mode, get prompt first and show it in results
          let decidePrompt: string | undefined;
          if (options.debugMode) {
            decidePrompt = JSON.stringify(
              {
                lessonRunId: lesson.lessonRunId,
                graderOutput,
              },
              null,
              2
            );
          }

          const coachOutput = await mutations.decideNextAction.mutateAsync({
            lessonRunId: lesson.lessonRunId,
            graderOutput,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (state.userActionTokenRef.current !== actionToken) return;

          // Update evaluation state with both grader and coach output
          state.setEvaluationState({
            type: "structured",
            graderOutput,
            coachOutput,
          });

          // Update debug card with decide prompt if in debug mode
          if (options.debugMode && decidePrompt && state.debugState?.type === "evaluation") {
            state.setDebugState({
              ...state.debugState,
              decidePrompt,
            });
          }

          // Debug mode: toast coach decision and skills
          if (options.debugMode && coachOutput) {
            toast({
              title: `🎯 Coach: ${coachOutput.nextAction}`,
              description: coachOutput.setupDelta
                ? `Setup: ${JSON.stringify(coachOutput.setupDelta)}`
                : undefined,
            });

            if (
              coachOutput.awardedSkills &&
              coachOutput.awardedSkills.length > 0
            ) {
              toast({
                title: `🏆 Skills Awarded`,
                description: coachOutput.awardedSkills.join(", "),
              });
            }
          }

          // Update skill unlock status if skills were awarded
          if (
            coachOutput?.awardedSkills &&
            coachOutput.awardedSkills.length > 0
          ) {
            const skillKey = coachOutput.awardedSkills[0];
            const skillTitle = await fetchSkillTitle(skillKey);
            const status = await fetchSkillStatus(skillKey, skillTitle);
            if (status) {
              state.setSkillToUnlock({ ...status, isUnlocked: true });
            }
          }

          state.setLessonState((prev) => ({
            ...prev,
            lastComment: coachOutput.feedbackText,
            lesson: { ...prev.lesson, attempts: prev.lesson.attempts + 1 },
          }));

          // Determine evaluation result based on grader output
          const isPositive = graderOutput.evaluation === "pass";
          state.setEvaluationResult(isPositive ? "positive" : "negative");

          // Return to practice mode after evaluation
          state.setMode("practice");
        } else {
          // FREE PRACTICE: Use piano-evaluate
          const result = await mutations.evaluateFreeFormLesson.mutateAsync({
            targetSequence: lesson.targetSequence,
            userSequence,
            instruction: lesson.instruction,
            language: options.language,
            model: options.model,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (state.userActionTokenRef.current !== actionToken) return;

          state.setEvaluationState({
            type: "free",
            freePracticeEvaluation: result,
          });

          const { evaluation, feedback } = result;

          state.setLessonState((prev) => ({
            ...prev,
            lastComment: feedback,
            lesson: { ...prev.lesson, attempts: prev.lesson.attempts + 1 },
          }));

          // Determine evaluation result
          const isPositive = evaluation === "correct";
          state.setEvaluationResult(isPositive ? "positive" : "negative");

          // Return to practice mode after evaluation
          state.setMode("practice");

          // Debug mode: toast evaluation result
          if (options.debugMode) {
            const evalEmoji =
              evaluation === "correct"
                ? "✅"
                : evaluation === "close"
                ? "⚠️"
                : "❌";
            const evalLabel =
              evaluation === "correct"
                ? "Pass"
                : evaluation === "close"
                ? "Close"
                : "Fail";
            toast({
              title: `${evalEmoji} ${evalLabel}`,
              description: `Evaluation: ${evaluation}`,
            });
          }
        }
      } catch (error) {
        console.error("Failed to evaluate attempt:", error);
        state.setLessonState((prev) => ({
          ...prev,
          lastComment: t("learnMode.evaluationFallback"),
          isEvaluating: false,
        }));
      } finally {
        state.hasEvaluatedRef.current = false;
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
      // In debug mode, get prompt first and show debug card
      if (options.debugMode) {
        try {
          let prompt = "";
          const evaluationType: "structured" | "free" =
            lesson.lessonRunId ? "structured" : "free";

          // Get prompt by calling with debug: true
          if (evaluationType === "structured") {
            prompt = JSON.stringify(
              {
                lessonRunId: lesson.lessonRunId,
                userSequence,
                metronomeContext: {
                  bpm: options.metronomeBpm,
                  meter: options.metronomeTimeSignature,
                },
              },
              null,
              2
            );
          } else {
            // For free practice, construct prompt manually
            prompt = JSON.stringify(
              {
                targetSequence: lesson.targetSequence,
                userSequence,
                instruction: lesson.instruction,
                language: options.language,
                model: options.model,
              },
              null,
              2
            );
          }

          // Show debug card
          state.setDebugState({
            type: "evaluation",
            prompt,
            userSequence,
            evaluationType,
            pendingCall: () => executeEvaluation(userSequence, evaluationType),
          });
          return;
        } catch (error) {
          console.error("Failed to get debug prompt:", error);
          // Fall through to normal execution
        }
      }

      // Normal mode or debug failed - proceed directly
      await executeEvaluation(
        userSequence,
        lesson.lessonRunId ? "structured" : "free"
      );
    },
    [
      state,
      options,
      executeEvaluation,
    ]
  );

  // Make lesson easier (for negative evaluation results)
  const handleMakeEasier = useCallback(() => {
    const { lesson } = state.lessonState;
    if (!lesson.lessonRunId) return;

    // Use the coach's suggested adjustment if available
    const coachOutput = state.evaluationState?.type === "structured" ? state.evaluationState.coachOutput : undefined;
    if (coachOutput?.setupDelta) {
      const newBpm = coachOutput.setupDelta.bpm ?? options.metronomeBpm;
      const newMeter = coachOutput.setupDelta.meter ?? options.metronomeTimeSignature;

      if (coachOutput.setupDelta.bpm && callbacks.setMetronomeBpm) {
        callbacks.setMetronomeBpm(coachOutput.setupDelta.bpm);
      }
      if (coachOutput.setupDelta.meter && callbacks.setMetronomeTimeSignature) {
        callbacks.setMetronomeTimeSignature(coachOutput.setupDelta.meter);
      }

      regenerateLessonWithNewSettings(newBpm, newMeter);
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
  }, [state, options, regenerateLessonWithNewSettings, generateLesson]);

  // Make lesson harder (for positive evaluation results)
  const handleMakeHarder = useCallback(() => {
    const { lesson } = state.lessonState;
    if (!lesson.lessonRunId) return;

    // Use the coach's suggested adjustment if available
    const coachOutput = state.evaluationState?.type === "structured" ? state.evaluationState.coachOutput : undefined;
    if (coachOutput?.setupDelta) {
      const newBpm = coachOutput.setupDelta.bpm ?? options.metronomeBpm;
      const newMeter = coachOutput.setupDelta.meter ?? options.metronomeTimeSignature;

      if (coachOutput.setupDelta.bpm && callbacks.setMetronomeBpm) {
        callbacks.setMetronomeBpm(coachOutput.setupDelta.bpm);
      }
      if (coachOutput.setupDelta.meter && callbacks.setMetronomeTimeSignature) {
        callbacks.setMetronomeTimeSignature(coachOutput.setupDelta.meter);
      }

      regenerateLessonWithNewSettings(newBpm, newMeter);
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
  }, [state, options, regenerateLessonWithNewSettings, generateLesson]);

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

