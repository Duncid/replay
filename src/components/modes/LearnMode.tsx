import { LessonCard, SkillToUnlock } from "@/components/LessonCard";
import { LessonDebugCard } from "@/components/LessonDebugCard";
import { EvaluationDebugCard } from "@/components/EvaluationDebugCard";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useDecideNextAction,
  useEvaluateFreeFormLesson,
  useEvaluateStructuredLesson,
  useRegenerateCurriculumLesson,
  useRegenerateFreeFormLesson,
  useStartCurriculumLesson,
  useStartFreeFormLesson,
  useTeacherGreeting,
  useSkillStatus,
  useSkillTitle,
} from "@/hooks/useLessonQueries";
import {
  fetchSkillStatus,
  fetchSkillTitle,
} from "@/services/lessonService";
import {
  CoachNextAction,
  CoachOutput,
  createInitialLessonState,
  GraderOutput,
  LessonBrief,
  LessonFeelPreset,
  LessonMetronomeSettings,
  LessonMetronomeSoundType,
  LessonRunSetup,
  LessonStartResponse,
  LessonState,
  TeacherGreetingResponse,
  TeacherSuggestion,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface LearnModeProps {
  isPlaying: boolean;
  onPlaySequence: (sequence: NoteSequence) => void;
  onStartRecording: () => void;
  isRecording: boolean;
  userRecording: NoteSequence | null;
  onClearRecording: () => void;
  language: string;
  model: string;
  debugMode: boolean;
  localUserId?: string | null;
  // Metronome control props
  metronomeBpm: number;
  setMetronomeBpm: (bpm: number) => void;
  metronomeTimeSignature: string;
  setMetronomeTimeSignature: (ts: string) => void;
  metronomeIsPlaying: boolean;
  setMetronomeIsPlaying: (playing: boolean) => void;
  setMetronomeFeel?: (feel: LessonFeelPreset) => void;
  setMetronomeSoundType?: (soundType: LessonMetronomeSoundType) => void;
}

// Unified debug state
type DebugState =
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

// Unified evaluation state
type EvaluationState =
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

export function LearnMode({
  isPlaying,
  onPlaySequence,
  isRecording,
  userRecording,
  onClearRecording,
  language,
  model,
  debugMode,
  localUserId,
  metronomeBpm,
  setMetronomeBpm,
  metronomeTimeSignature,
  setMetronomeTimeSignature,
  metronomeIsPlaying,
  setMetronomeIsPlaying,
  setMetronomeFeel,
  setMetronomeSoundType,
}: LearnModeProps) {
  const [prompt, setPrompt] = useState("");
  const [lesson, setLesson] = useState<LessonState>(createInitialLessonState());
  const [lastComment, setLastComment] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  // React Query hooks
  const [shouldFetchGreeting, setShouldFetchGreeting] = useState(false);
  const {
    data: teacherGreeting,
    isLoading: isLoadingTeacher,
    error: teacherGreetingError,
  } = useTeacherGreeting(language, localUserId, shouldFetchGreeting);

  const startCurriculumLessonMutation = useStartCurriculumLesson();
  const startFreeFormLessonMutation = useStartFreeFormLesson();
  const regenerateCurriculumLessonMutation = useRegenerateCurriculumLesson();
  const regenerateFreeFormLessonMutation = useRegenerateFreeFormLesson();
  const evaluateStructuredLessonMutation = useEvaluateStructuredLesson();
  const evaluateFreeFormLessonMutation = useEvaluateFreeFormLesson();
  const decideNextActionMutation = useDecideNextAction();

  // Combined loading state from mutations
  const isLoading =
    startCurriculumLessonMutation.isPending ||
    startFreeFormLessonMutation.isPending ||
    regenerateCurriculumLessonMutation.isPending ||
    regenerateFreeFormLessonMutation.isPending;

  // Consolidated debug state
  const [debugState, setDebugState] = useState<DebugState>(null);
  const [isLoadingLessonDebug, setIsLoadingLessonDebug] = useState(false);
  const [skillToUnlock, setSkillToUnlock] = useState<SkillToUnlock | null>(
    null
  );
  // Lesson mode state
  const [lessonMode, setLessonMode] = useState<"practice" | "evaluation">("practice");
  const [evaluationResult, setEvaluationResult] = useState<"positive" | "negative" | null>(null);
  // Consolidated evaluation state
  const [evaluationState, setEvaluationState] = useState<EvaluationState>(null);
  const { toast } = useToast();
  const hasEvaluatedRef = useRef(false);
  // userActionTokenRef is kept to prevent stale updates when user performs new actions
  // React Query handles request cancellation automatically
  const userActionTokenRef = useRef<string>(crypto.randomUUID());
  const { t } = useTranslation();

  const markUserAction = useCallback(() => {
    userActionTokenRef.current = crypto.randomUUID();
    hasEvaluatedRef.current = false;
    setIsEvaluating(false);
    setSkillToUnlock(null);
    setEvaluationState(null);
    setDebugState(null);
  }, []);

  // No auto-fetch on mount - user must click "Start"

  // Fetch teacher greeting when user clicks Start
  const handleStartTeacherGreet = useCallback(() => {
    setShouldFetchGreeting(true);
  }, []);

  // Show error toast if teacher greeting fails
  useEffect(() => {
    if (teacherGreetingError) {
        toast({
          title: "Error",
        description:
          teacherGreetingError instanceof Error
            ? teacherGreetingError.message
            : "Failed to connect to teacher",
          variant: "destructive",
        });
    }
  }, [teacherGreetingError, toast]);

  // Apply metronome settings from a lesson response
  const applyMetronomeSettings = useCallback(
    (metronome?: LessonMetronomeSettings) => {
      if (!metronome) return;

      if (typeof metronome.bpm === "number") {
        setMetronomeBpm(metronome.bpm);
      }
      if (typeof metronome.timeSignature === "string") {
        setMetronomeTimeSignature(metronome.timeSignature);
      }
      if (typeof metronome.isActive === "boolean") {
        setMetronomeIsPlaying(metronome.isActive);
      }
      if (metronome.feel && setMetronomeFeel) {
        setMetronomeFeel(metronome.feel);
      }
      if (metronome.soundType && setMetronomeSoundType) {
        setMetronomeSoundType(metronome.soundType);
      }
    },
    [
      setMetronomeBpm,
      setMetronomeTimeSignature,
      setMetronomeIsPlaying,
      setMetronomeFeel,
      setMetronomeSoundType,
    ]
  );

  // Note: fetchSkillStatus and fetchSkillTitle are now imported from lessonService

  // Regenerate demo sequence with new BPM/meter settings
  const regenerateLessonWithNewSettings = useCallback(
    async (newBpm: number, newMeter: string) => {
      if (!lesson.lessonRunId || lesson.targetSequence.notes.length === 0)
        return;

      try {
        if (lesson.lessonNodeKey) {
          // CURRICULUM LESSON: Use lesson-start with setup overrides
          // Note: This creates a new lesson run. The old run remains for history.
          const lessonStartData = await regenerateCurriculumLessonMutation.mutateAsync({
            lessonKey: lesson.lessonNodeKey,
            language,
            setupOverrides: {
              bpm: newBpm,
              meter: newMeter,
            },
          });

          // Apply metronome settings from the response
          if (lessonStartData.metronome) {
            applyMetronomeSettings(lessonStartData.metronome);
          }

          // Update the lesson with the new data
          setLesson((prev) => ({
            ...prev,
            targetSequence: lessonStartData.demoSequence || prev.targetSequence,
            instruction: lessonStartData.instruction,
            lessonRunId: lessonStartData.lessonRunId, // New lesson run ID
            trackKey: lessonStartData.lessonBrief.trackKey,
            trackTitle: lessonStartData.lessonBrief.trackTitle,
            awardedSkills: lessonStartData.lessonBrief.awardedSkills || [],
          }));

          // Update skill unlock status if there are awarded skills
          if (lessonStartData.lessonBrief.awardedSkills && lessonStartData.lessonBrief.awardedSkills.length > 0) {
            const skillKey = lessonStartData.lessonBrief.awardedSkills[0];
            const skillTitle = await fetchSkillTitle(skillKey);
            const status = await fetchSkillStatus(skillKey, skillTitle);
            if (status) {
              setSkillToUnlock(status);
            }
          }

          // Reset evaluation state when regenerating
          setEvaluationResult(null);
          setLastComment(null);

          // Play the new example
          setTimeout(() => onPlaySequence(lessonStartData.demoSequence || lesson.targetSequence), 500);
        } else {
          // FREE-FORM PRACTICE: Use piano-learn
        const regeneratePrompt = lesson.userPrompt || lesson.instruction;
        const localizedPrompt =
          language === "fr"
            ? `${regeneratePrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
            : regeneratePrompt;

          const data = await regenerateFreeFormLessonMutation.mutateAsync({
            prompt: localizedPrompt,
            difficulty: lesson.difficulty,
            newBpm,
            newMeter,
            language,
            model,
          });

          // Apply metronome settings from the AI response
          if (data.metronome) {
            applyMetronomeSettings(data.metronome);
        }

        // Update the lesson with the new sequence
        setLesson((prev) => ({
          ...prev,
          targetSequence: data.sequence,
          instruction: data.instruction,
        }));

        // Reset evaluation state when regenerating
        setEvaluationResult(null);
        setLastComment(null);

        // Play the new example
        setTimeout(() => onPlaySequence(data.sequence), 500);
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
      lesson.lessonRunId,
      lesson.lessonNodeKey,
      lesson.targetSequence,
      lesson.userPrompt,
      lesson.instruction,
      lesson.difficulty,
      applyMetronomeSettings,
      fetchSkillStatus,
      fetchSkillTitle,
      language,
      model,
      onPlaySequence,
      regenerateCurriculumLessonMutation,
      regenerateFreeFormLessonMutation,
      toast,
    ]
  );

  const generateLesson = useCallback(
    async (
      userPrompt: string,
      difficulty: number = 1,
      previousSequence?: NoteSequence,
      lessonNodeKey?: string
    ) => {
      markUserAction();
      const actionToken = userActionTokenRef.current;
      // Clear debug state first, then set loading to ensure spinner shows
      setDebugState(null); // Clear any debug state
      setLastComment(null);

      try {
        let lessonRunId: string | undefined;
        let instruction: string;
        let targetSequence: NoteSequence;
        let trackKey: string | undefined;
        let trackTitle: string | undefined;
        let awardedSkills: string[] = [];
        let lessonBrief: LessonBrief | undefined;
        let metronomeSettings: LessonMetronomeSettings | undefined;

        if (lessonNodeKey) {
          // CURRICULUM LESSON: Use lesson-start
          const lessonStartData = await startCurriculumLessonMutation.mutateAsync({
            lessonKey: lessonNodeKey,
            language,
            debug: false,
        });

        // Check if user performed a new action (React Query handles request cancellation)
        if (userActionTokenRef.current !== actionToken) return;

          // Type guard for debug mode response
          if ("prompt" in lessonStartData) {
            throw new Error("Unexpected debug response in non-debug mode");
          }

          lessonRunId = lessonStartData.lessonRunId;
          instruction = lessonStartData.instruction;
          targetSequence = lessonStartData.demoSequence || { notes: [], totalTime: 0 };
          lessonBrief = lessonStartData.lessonBrief;
          metronomeSettings = lessonStartData.metronome;
          trackKey = lessonBrief.trackKey;
          trackTitle = lessonBrief.trackTitle;
          awardedSkills = lessonBrief.awardedSkills || [];

          // Apply metronome settings from the response
          if (metronomeSettings) {
            applyMetronomeSettings(metronomeSettings);
            }

            // Fetch skill status for the first awarded skill
            if (awardedSkills.length > 0) {
              const skillTitle = await fetchSkillTitle(awardedSkills[0]);
              const status = await fetchSkillStatus(
                awardedSkills[0],
                skillTitle
              );
              setSkillToUnlock(status);
            } else {
              setSkillToUnlock(null);
            }
        } else {
          // FREE-FORM PRACTICE: Use piano-learn
          const localizedPrompt =
            language === "fr"
              ? `${userPrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
              : userPrompt;

          const data = await startFreeFormLessonMutation.mutateAsync({
            prompt: localizedPrompt,
            difficulty,
            previousSequence,
            language,
            model,
            debug: false,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (userActionTokenRef.current !== actionToken) return;

          instruction = data.instruction;
          targetSequence = data.sequence;
          metronomeSettings = data.metronome;

          // Apply metronome settings from the AI response
          if (metronomeSettings) {
            applyMetronomeSettings(metronomeSettings);
          }

          setSkillToUnlock(null);
        }

        setLesson({
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
        setLessonMode("practice");
        setEvaluationResult(null);
        hasEvaluatedRef.current = false;
        onClearRecording();

        // Automatically play the demo
        setTimeout(() => onPlaySequence(targetSequence), 500);
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
        setLesson(createInitialLessonState());
        setPrompt("");
        setLastComment(null);
        setDebugState(null);
        setLessonMode("practice");
        setEvaluationResult(null);
        onClearRecording();
      }
      // Note: React Query mutations handle loading state and cancellation automatically
    },
    [
      applyMetronomeSettings,
      fetchSkillStatus,
      fetchSkillTitle,
      language,
      markUserAction,
      metronomeBpm,
      metronomeTimeSignature,
      model,
      onClearRecording,
      onPlaySequence,
      t,
      toast,
    ]
  );

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isLoading) return;
    generateLesson(prompt.trim());
  }, [prompt, isLoading, generateLesson]);

  const handlePlay = useCallback(() => {
    if (lesson.targetSequence.notes.length > 0) {
      onPlaySequence(lesson.targetSequence);
    }
  }, [lesson.targetSequence, onPlaySequence]);

  // Helper to execute evaluation after debug approval
  const executeEvaluation = useCallback(
    async (
      userSequence: NoteSequence,
      evaluationType: "structured" | "free"
    ) => {
      const actionToken = userActionTokenRef.current;
      setIsEvaluating(true);
      setDebugState(null);
      setEvaluationState(null);

      try {
        // STRUCTURED LESSON: Use lesson-evaluate → lesson-decide
        if (evaluationType === "structured" && lesson.lessonRunId) {
          // Step 1: Call lesson-evaluate
          const graderOutput = await evaluateStructuredLessonMutation.mutateAsync({
                lessonRunId: lesson.lessonRunId,
                userSequence,
                metronomeContext: {
                  bpm: metronomeBpm,
                  meter: metronomeTimeSignature,
              },
            });

          // Check if user performed a new action (React Query handles request cancellation)
          if (userActionTokenRef.current !== actionToken) return;

          // Store grader output temporarily (will be combined with coach output)
          setEvaluationState({
            type: "structured",
            graderOutput,
          });

          // Debug mode: toast grader evaluation
          if (debugMode) {
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
          if (debugMode) {
            decidePrompt = JSON.stringify(
              {
                lessonRunId: lesson.lessonRunId,
                graderOutput,
              },
              null,
              2
            );
          }

          const coachOutput = await decideNextActionMutation.mutateAsync({
                lessonRunId: lesson.lessonRunId,
                graderOutput,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (userActionTokenRef.current !== actionToken) return;

          // Update evaluation state with both grader and coach output
          setEvaluationState({
            type: "structured",
            graderOutput,
            coachOutput,
          });
          
          // Update debug card with decide prompt if in debug mode
          if (debugMode && decidePrompt && debugState?.type === "evaluation") {
            setDebugState({
              ...debugState,
              decidePrompt,
            });
          }

          // Debug mode: toast coach decision and skills
          if (debugMode && coachOutput) {
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
              setSkillToUnlock({ ...status, isUnlocked: true });
            }
          }

          setLastComment(coachOutput.feedbackText);
          setLesson((prev) => ({
            ...prev,
            attempts: prev.attempts + 1,
          }));

          // Determine evaluation result based on grader output
          const isPositive = graderOutput.evaluation === "pass";
          setEvaluationResult(isPositive ? "positive" : "negative");
          
          // Return to practice mode after evaluation
          setLessonMode("practice");

          // Don't auto-regenerate - let user decide with Make Easier/Harder buttons
          // Store coach output for use in handleMakeEasier/harder
        } else {
          // FREE PRACTICE: Use piano-evaluate
          const result = await evaluateFreeFormLessonMutation.mutateAsync({
                targetSequence: lesson.targetSequence,
                userSequence,
                instruction: lesson.instruction,
                language,
                model,
          });

          // Check if user performed a new action (React Query handles request cancellation)
          if (userActionTokenRef.current !== actionToken) return;

          setEvaluationState({
            type: "free",
            freePracticeEvaluation: result,
          });
          
          const { evaluation, feedback } = result;

          setLastComment(feedback);
          setLesson((prev) => ({
            ...prev,
            attempts: prev.attempts + 1,
          }));

          // Determine evaluation result
          const isPositive = evaluation === "correct";
          setEvaluationResult(isPositive ? "positive" : "negative");
          
          // Return to practice mode after evaluation
          setLessonMode("practice");

          // Debug mode: toast evaluation result
          if (debugMode) {
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
        setLastComment(t("learnMode.evaluationFallback"));
      } finally {
        setIsEvaluating(false);
        hasEvaluatedRef.current = false;
        onClearRecording();
      }
    },
    [
      debugMode,
      fetchSkillStatus,
      fetchSkillTitle,
      language,
      lesson.instruction,
      lesson.lessonRunId,
      lesson.targetSequence,
      metronomeBpm,
      metronomeTimeSignature,
      model,
      onClearRecording,
      onPlaySequence,
      regenerateLessonWithNewSettings,
      setMetronomeBpm,
      setMetronomeTimeSignature,
      t,
      toast,
    ]
  );

  // Main evaluateAttempt function - intercepts in debug mode
  const evaluateAttempt = useCallback(
    async (userSequence: NoteSequence) => {
      // In debug mode, get prompt first and show debug card
      if (debugMode) {
        try {
          let prompt = "";
          const evaluationType: "structured" | "free" =
            lesson.lessonRunId ? "structured" : "free";

          // Get prompt by calling with debug: true
          if (evaluationType === "structured") {
            // For structured lessons, we need to call the service with debug mode
            // Since the service doesn't return the prompt directly, we'll construct it
            // based on what we know the function receives
            prompt = JSON.stringify(
              {
                  lessonRunId: lesson.lessonRunId,
                  userSequence,
                  metronomeContext: {
                    bpm: metronomeBpm,
                    meter: metronomeTimeSignature,
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
                language,
                model,
              },
              null,
              2
            );
          }

          // Show debug card
          setDebugState({
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
      debugMode,
      lesson.lessonRunId,
      lesson.targetSequence,
      lesson.instruction,
      metronomeBpm,
      metronomeTimeSignature,
      language,
      model,
      executeEvaluation,
    ]
  );

  // Watch for recording completion to trigger evaluation (only in evaluation mode)
  // In practice mode, no recording or evaluation happens
  // Only trigger if we're actively in evaluation mode and recording just completed
  useEffect(() => {
    if (
      lesson.phase === "your_turn" &&
      lessonMode === "evaluation" &&
      userRecording &&
      userRecording.notes.length > 0 &&
      !isRecording &&
      !hasEvaluatedRef.current &&
      !isEvaluating &&
      !(debugState?.type === "evaluation") // Don't trigger if debug card is already shown
    ) {
      hasEvaluatedRef.current = true;
      evaluateAttempt(userRecording);
    }
  }, [lesson.phase, lessonMode, userRecording, isRecording, isEvaluating, evaluateAttempt, debugState]);

  // Enter evaluation mode
  const handleEvaluate = useCallback(() => {
    setLessonMode("evaluation");
    setEvaluationResult(null);
    setLastComment(null);
    // Clear any existing recording and reset evaluation state
    onClearRecording();
    hasEvaluatedRef.current = false;
    setDebugState(null);
    setEvaluationState(null);
    // Recording will start when user actually plays (handled by parent)
    // Make sure we don't have any stale recording that would trigger evaluation immediately
  }, [onClearRecording]);

  // Make lesson easier (for negative evaluation results)
  const handleMakeEasier = useCallback(() => {
    if (!lesson.lessonRunId) return;
    
    // Use the coach's suggested adjustment if available
    const coachOutput = evaluationState?.type === "structured" ? evaluationState.coachOutput : undefined;
    if (coachOutput?.setupDelta) {
      const newBpm = coachOutput.setupDelta.bpm ?? metronomeBpm;
      const newMeter = coachOutput.setupDelta.meter ?? metronomeTimeSignature;

      if (coachOutput.setupDelta.bpm) {
        setMetronomeBpm(coachOutput.setupDelta.bpm);
      }
      if (coachOutput.setupDelta.meter) {
        setMetronomeTimeSignature(coachOutput.setupDelta.meter);
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
    
    setEvaluationResult(null);
    setLastComment(null);
  }, [
    lesson.lessonRunId,
    lesson.userPrompt,
    lesson.difficulty,
    lesson.targetSequence,
    lesson.lessonNodeKey,
    evaluationState,
    metronomeBpm,
    metronomeTimeSignature,
    setMetronomeBpm,
    setMetronomeTimeSignature,
    regenerateLessonWithNewSettings,
    generateLesson,
  ]);

  // Make lesson harder (for positive evaluation results)
  const handleMakeHarder = useCallback(() => {
    if (!lesson.lessonRunId) return;
    
    // Use the coach's suggested adjustment if available
    const coachOutput = evaluationState?.type === "structured" ? evaluationState.coachOutput : undefined;
    if (coachOutput?.setupDelta) {
      const newBpm = coachOutput.setupDelta.bpm ?? metronomeBpm;
      const newMeter = coachOutput.setupDelta.meter ?? metronomeTimeSignature;

      if (coachOutput.setupDelta.bpm) {
        setMetronomeBpm(coachOutput.setupDelta.bpm);
      }
      if (coachOutput.setupDelta.meter) {
        setMetronomeTimeSignature(coachOutput.setupDelta.meter);
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
    
    setEvaluationResult(null);
    setLastComment(null);
  }, [
    lesson.lessonRunId,
    lesson.userPrompt,
    lesson.difficulty,
    lesson.targetSequence,
    lesson.lessonNodeKey,
    evaluationState,
    metronomeBpm,
    metronomeTimeSignature,
    setMetronomeBpm,
    setMetronomeTimeSignature,
    regenerateLessonWithNewSettings,
    generateLesson,
  ]);

  const handleLeave = useCallback(() => {
    markUserAction();
    setLesson(createInitialLessonState());
    setPrompt("");
    setLastComment(null);
    setDebugState(null);
    setLessonMode("practice");
    setEvaluationResult(null);
    onClearRecording();
    setTeacherGreeting(null);
  }, [markUserAction, onClearRecording]);

  // When a suggestion is clicked, fetch the debug prompt first (only in debug mode)
  const handleSelectActivity = useCallback(
    async (suggestion: TeacherSuggestion) => {
      // Build prompt from suggestion
      const lessonPrompt = `${suggestion.label}: ${suggestion.why}`;

      // In debug mode, fetch debug prompt and show debug card
      if (debugMode) {
        setIsLoadingLessonDebug(true);

        try {
          // For curriculum lessons, use lesson-start; for free-form, use piano-learn
          // Since suggestions always have lessonKey, use lesson-start
          const data = await startCurriculumLessonMutation.mutateAsync({
            lessonKey: suggestion.lessonKey,
            language,
            debug: true,
          });

          // In debug mode, lesson-start returns { prompt, lessonBrief, setup }
          if ("prompt" in data && data.prompt) {
            setDebugState({
              type: "lesson",
              suggestion,
              prompt: data.prompt,
            });
          } else {
            throw new Error("Debug mode not returning expected data");
          }
        } catch (err) {
          console.error("Failed to fetch lesson debug:", err);
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to prepare lesson",
            variant: "destructive",
          });
        } finally {
          setIsLoadingLessonDebug(false);
        }
      } else {
        // In normal mode, directly start the lesson
        generateLesson(lessonPrompt, 1, undefined, suggestion.lessonKey);
      }
    },
    [debugMode, language, toast, generateLesson, startCurriculumLessonMutation]
  );

  // Start the actual lesson after seeing the debug prompt
  const handleStartLesson = useCallback(() => {
    if (debugState?.type !== "lesson") return;

    const suggestion = debugState.suggestion;
    const prompt = `${suggestion.label}: ${suggestion.why}`;
    generateLesson(prompt, 1, undefined, suggestion.lessonKey); // Lesson Coach will determine difficulty
  }, [debugState, generateLesson]);

  const handleCancelLessonDebug = useCallback(() => {
    setDebugState(null);
  }, []);

  const handleFreePractice = useCallback(() => {
    setLesson((prev) => ({
      ...prev,
      phase: "prompt",
    }));
  }, []);

  // Handle proceeding from evaluation debug card
  const handleProceedEvaluation = useCallback(() => {
    if (debugState?.type === "evaluation") {
      debugState.pendingCall();
    }
  }, [debugState]);

  const handleCancelEvaluation = useCallback(() => {
    setDebugState(null);
    setEvaluationState(null);
    setIsEvaluating(false);
    hasEvaluatedRef.current = false;
    // Return to practice mode when cancelling
    setLessonMode("practice");
    onClearRecording();
  }, [onClearRecording]);

  const suggestions = [
    ...((t("learnMode.suggestions", { returnObjects: true }) as string[]) ||
      []),
  ];

  const render = () => (
    <>
      {debugState?.type === "evaluation" ? (
        /* Evaluation Debug Card - shown before evaluation LLM calls */
        <EvaluationDebugCard
          prompt={debugState.prompt}
          userSequence={debugState.userSequence}
          evaluationType={debugState.evaluationType}
          onProceed={handleProceedEvaluation}
          onCancel={handleCancelEvaluation}
          graderOutput={evaluationState?.type === "structured" ? evaluationState.graderOutput : undefined}
          coachOutput={evaluationState?.type === "structured" ? evaluationState.coachOutput : undefined}
          freePracticeEvaluation={evaluationState?.type === "free" ? evaluationState.freePracticeEvaluation : undefined}
          decidePrompt={debugState.decidePrompt}
        />
      ) : isLoading && lesson.phase === "welcome" && debugState?.type !== "evaluation" ? (
        /* Loading spinner while generating lesson after selecting activity */
        /* This shows in both debug and normal mode when generating lesson */
        /* Show when loading, in welcome phase, and not showing evaluation debug */
        <div className="w-full max-w-2xl mx-auto">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {t("learnMode.generatingLesson", "Generating lesson...")}
            </p>
          </div>
        </div>
      ) : debugMode && debugState?.type === "lesson" && !isLoading ? (
        /* Lesson Debug Card - shown after selecting a suggestion (debug mode only) */
        <LessonDebugCard
          suggestion={debugState.suggestion}
          prompt={debugState.prompt}
          isLoading={isLoading}
          onStart={handleStartLesson}
          onCancel={handleCancelLessonDebug}
        />
      ) : debugMode && isLoadingLessonDebug ? (
        /* Loading lesson debug */
        <div className="w-full max-w-2xl mx-auto">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Preparing lesson...</p>
          </div>
        </div>
      ) : lesson.phase === "welcome" ? (
        /* Teacher Welcome */
        <TeacherWelcome
          greeting={teacherGreeting}
          isLoading={isLoadingTeacher}
          onSelectActivity={handleSelectActivity}
          onStart={handleStartTeacherGreet}
          language={language}
          localUserId={localUserId}
          debugMode={debugMode}
        />
      ) : lesson.phase === "prompt" ? (
        /* Initial Prompt Input */
        <div className="w-full max-w-2xl mx-auto space-y-3">
          <Textarea
            placeholder={t("learnMode.promptPlaceholder")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading || isPlaying}
            className="min-h-[120px] text-lg resize-none"
          />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => {
                  setPrompt(suggestion);
                  generateLesson(suggestion);
                }}
                disabled={isLoading || isPlaying}
                className="text-muted-foreground"
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading || isPlaying}
            className="w-full gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {t("learnMode.startLearning")}
          </Button>
        </div>
      ) : (
        /* Active Lesson */
        <LessonCard
          instruction={lesson.instruction}
          lastComment={lastComment}
          isEvaluating={isEvaluating}
          isLoading={isLoading || isPlaying}
          mode={lessonMode}
          evaluationResult={evaluationResult}
          isRecording={isRecording && lessonMode === "evaluation"}
          onPlay={handlePlay}
          onEvaluate={handleEvaluate}
          onLeave={handleLeave}
          onMakeEasier={handleMakeEasier}
          onMakeHarder={handleMakeHarder}
          trackTitle={lesson.trackTitle}
          skillToUnlock={skillToUnlock}
        />
      )}
    </>
  );

  const handleUserAction = useCallback(() => {
    markUserAction();
  }, [markUserAction]);

  // Expose lesson mode to parent so it can control recording
  return { lesson, render, handleUserAction, handleFreePractice, lessonMode };
}
