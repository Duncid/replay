import { LessonCard, SkillToUnlock } from "@/components/LessonCard";
import { LessonDebugCard } from "@/components/LessonDebugCard";
import { EvaluationDebugCard } from "@/components/EvaluationDebugCard";
import { FeedbackScreen } from "@/components/FeedbackScreen";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import {
  useEvaluateStructuredLesson,
  useRegenerateCurriculumLesson,
  useStartCurriculumLesson,
  useTeacherGreeting,
} from "@/hooks/useLessonQueries";
import {
  LessonFeelPreset,
  LessonMetronomeSettings,
  LessonMetronomeSoundType,
  TeacherSuggestion,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLessonState } from "@/hooks/useLessonState";
import { useLessonEngine, DebugState, EvaluationState } from "@/hooks/useLessonEngine";

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

// DebugState and EvaluationState are now exported from useLessonEngine

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
  // === State Management ===
  const {
    lessonState,
    setLessonState,
    updateLesson,
    resetLesson,
    modeState,
    setModeState,
    setMode,
    setEvaluationResult,
    uiState,
    setLoadingLessonDebug,
    setShouldFetchGreeting,
    skillToUnlock,
    setSkillToUnlock,
  } = useLessonState();

  // Extract individual values for easier access
  const { prompt, lesson, lastComment, isEvaluating } = lessonState;
  const { mode: lessonMode, evaluationResult } = modeState;
  const { isLoadingLessonDebug, shouldFetchGreeting } = uiState;

  // === React Query Hooks ===
  const {
    data: teacherGreeting,
    isLoading: isLoadingTeacher,
    error: teacherGreetingError,
  } = useTeacherGreeting(language, localUserId, shouldFetchGreeting);

  // React Query mutations (used for both loading state and passed to engine)
  const startCurriculumLessonMutation = useStartCurriculumLesson();
  const regenerateCurriculumLessonMutation = useRegenerateCurriculumLesson();
  const evaluateStructuredLessonMutation = useEvaluateStructuredLesson();
  
  // Combined loading state from mutations
  const isLoading =
    startCurriculumLessonMutation.isPending ||
    regenerateCurriculumLessonMutation.isPending;

  // Additional state
  const [debugState, setDebugState] = useState<DebugState>(null);
  const [evaluationState, setEvaluationState] = useState<EvaluationState>(null);
  const [showEvaluationScreen, setShowEvaluationScreen] = useState(false);
  
  // Refs
  const hasEvaluatedRef = useRef(false);
  const userActionTokenRef = useRef<string>(crypto.randomUUID());
  
  // Hooks
  const { toast } = useToast();
  const { t } = useTranslation();

  // Fetch teacher greeting when user clicks Start
  const handleStartTeacherGreet = useCallback(() => {
    setShouldFetchGreeting(true);
  }, []);

  // === Effects ===
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

  // === Business Logic ===
  const engine = useLessonEngine(
    {
      lessonState,
      setLessonState,
      updateLesson,
      resetLesson,
      modeState,
      setMode,
      setEvaluationResult,
      setSkillToUnlock,
      setDebugState,
      setEvaluationState,
      setShowEvaluationScreen,
      debugState,
      evaluationState,
      hasEvaluatedRef,
      userActionTokenRef,
    },
    {
      onPlaySequence,
      onClearRecording,
      applyMetronomeSettings,
      setMetronomeBpm,
      setMetronomeTimeSignature,
    },
    {
      startCurriculumLesson: startCurriculumLessonMutation,
      regenerateCurriculumLesson: regenerateCurriculumLessonMutation,
      evaluateStructuredLesson: evaluateStructuredLessonMutation,
    },
    {
      language,
      model,
      debugMode,
      metronomeBpm,
      metronomeTimeSignature,
      localUserId,
    }
  );

  // Extract functions from engine
  const {
    generateLesson,
    regenerateLessonWithNewSettings,
    executeEvaluation,
    evaluateAttempt,
    handleMakeEasier,
    handleMakeHarder,
    markUserAction,
  } = engine;

  // All business logic is now in useLessonEngine hook

  const handlePlay = useCallback(() => {
    if (lesson.targetSequence.notes.length > 0) {
      onPlaySequence(lesson.targetSequence);
    }
  }, [lesson.targetSequence, onPlaySequence]);

  // executeEvaluation and evaluateAttempt are now in useLessonEngine hook

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

  // Enter evaluation mode or return to practice
  const handleEvaluate = useCallback(() => {
    if (lessonMode === "practice") {
      // Switch to evaluation mode
      setMode("evaluation");
      setEvaluationResult(null);
      setLessonState((prev) => ({ ...prev, lastComment: null }));
      // Clear any existing recording and reset evaluation state
      onClearRecording();
      hasEvaluatedRef.current = false;
      setDebugState(null);
      setEvaluationState(null);
      // Recording will start when user actually plays (handled by parent)
      // Make sure we don't have any stale recording that would trigger evaluation immediately
    } else {
      // Switch back to practice mode
      setMode("practice");
      onClearRecording();
      hasEvaluatedRef.current = false;
    }
  }, [lessonMode, onClearRecording, setMode, setEvaluationResult, setLessonState]);

  // handleMakeEasier and handleMakeHarder are now in useLessonEngine hook

  const handleLeave = useCallback(() => {
    markUserAction();
    resetLesson();
    setLessonState((prev) => ({ ...prev, prompt: "", lastComment: null }));
    setDebugState(null);
    setMode("practice");
    setEvaluationResult(null);
    onClearRecording();
    setShouldFetchGreeting(false);
  }, [markUserAction, onClearRecording, resetLesson, setLessonState, setMode, setShouldFetchGreeting]);

  // When a suggestion is clicked, fetch the debug prompt first (only in debug mode)
  const handleSelectActivity = useCallback(
    async (suggestion: TeacherSuggestion) => {
      // Build prompt from suggestion
      const lessonPrompt = `${suggestion.label}: ${suggestion.why}`;

      // In debug mode, fetch debug prompt and show debug card
      if (debugMode) {
        setLoadingLessonDebug(true);

        try {
          // For curriculum lessons, use lesson-start; for free-form, use piano-learn
          // Since suggestions always have lessonKey, use lesson-start
          // Use the mutation that's already declared at the top level
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
          setLoadingLessonDebug(false);
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

  // Handle proceeding from evaluation debug card
  const handleProceedEvaluation = useCallback(async () => {
    if (debugState?.type === "evaluation") {
      try {
        console.log("handleProceedEvaluation: Calling pendingCall");
        await debugState.pendingCall();
        console.log("handleProceedEvaluation: pendingCall completed");
      } catch (error) {
        console.error("Error in handleProceedEvaluation:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to evaluate performance",
          variant: "destructive",
        });
      }
    }
  }, [debugState, toast]);

  const handleCancelEvaluation = useCallback(() => {
    setDebugState(null);
    setEvaluationState(null);
    setLessonState((prev) => ({ ...prev, isEvaluating: false }));
    hasEvaluatedRef.current = false;
    // Return to practice mode when cancelling
    setMode("practice");
    onClearRecording();
  }, [onClearRecording, setLessonState, setMode]);

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
          evaluationOutput={evaluationState?.type === "structured" ? evaluationState.evaluationOutput : undefined}
        />
      ) : isLoading && lesson.phase === "welcome" && debugState?.type !== "lesson" ? (
        /* Loading spinner while generating lesson after selecting activity */
        /* This shows in both debug and normal mode when generating lesson */
        /* Show when loading, in welcome phase, and not showing evaluation debug */
        <LoadingSpinner message={t("learnMode.generatingLesson", "Generating lesson...")} />
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
        <LoadingSpinner message="Preparing lesson..." />
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
      ) : showEvaluationScreen ? (
        /* Feedback Screen - replaces the dialog */
        <FeedbackScreen
          evaluation={evaluationState?.type === "structured" ? evaluationState.evaluationOutput.evaluation : "close"}
          feedbackText={evaluationState?.type === "structured" ? evaluationState.evaluationOutput.feedbackText : ""}
          awardedSkills={evaluationState?.type === "structured" && evaluationState.awardedSkillsWithTitles?.length 
            ? evaluationState.awardedSkillsWithTitles
            : undefined}
          onReturnToPractice={() => {
            setShowEvaluationScreen(false);
            setMode("practice");
            setEvaluationState(null);
            onClearRecording();
            hasEvaluatedRef.current = false;
          }}
          onMakeEasier={() => {
            setShowEvaluationScreen(false);
            handleMakeEasier();
          }}
          onMakeHarder={() => {
            setShowEvaluationScreen(false);
            handleMakeHarder();
          }}
          onFinishLesson={() => {
            setShowEvaluationScreen(false);
            handleLeave();
          }}
        />
      ) : (
        /* Active Lesson */
        <LessonCard
          instruction={lesson.instruction}
          isEvaluating={isEvaluating}
          isLoading={isLoading || isPlaying}
          mode={lessonMode}
          isRecording={isRecording && lessonMode === "evaluation"}
          onPlay={handlePlay}
          onEvaluate={handleEvaluate}
          onLeave={handleLeave}
          trackTitle={lesson.trackTitle}
          skillToUnlock={skillToUnlock}
          debugMode={debugMode}
          difficulty={lesson.difficulty}
        />
      )}
    </>
  );

  const handleUserAction = useCallback(() => {
    markUserAction();
  }, [markUserAction]);

  // Expose lesson mode to parent so it can control recording
  return { lesson, render, handleUserAction, lessonMode };
}
