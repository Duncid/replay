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

  // Additional state
  const [debugState, setDebugState] = useState<DebugState>(null);
  const [evaluationState, setEvaluationState] = useState<EvaluationState>(null);
  
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
      debugState,
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
      startFreeFormLesson: startFreeFormLessonMutation,
      regenerateCurriculumLesson: regenerateCurriculumLessonMutation,
      regenerateFreeFormLesson: regenerateFreeFormLessonMutation,
      evaluateStructuredLesson: evaluateStructuredLessonMutation,
      evaluateFreeFormLesson: evaluateFreeFormLessonMutation,
      decideNextAction: decideNextActionMutation,
    },
    {
      language,
      model,
      debugMode,
      metronomeBpm,
      metronomeTimeSignature,
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

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isLoading) return;
    generateLesson(prompt.trim());
  }, [prompt, isLoading, generateLesson]);

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

  // Enter evaluation mode
  const handleEvaluate = useCallback(() => {
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
  }, [onClearRecording]);

  // handleMakeEasier and handleMakeHarder are now in useLessonEngine hook

  const handleLeave = useCallback(() => {
    markUserAction();
    resetLesson();
    setLessonState((prev) => ({ ...prev, prompt: "", lastComment: null }));
    setDebugState(null);
    setMode("practice");
    setEvaluationResult(null);
    onClearRecording();
    setTeacherGreeting(null);
  }, [markUserAction, onClearRecording, resetLesson, setLessonState, setMode]);

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

  const handleFreePractice = useCallback(() => {
    updateLesson({ phase: "prompt" });
  }, [updateLesson]);

  // Handle proceeding from evaluation debug card
  const handleProceedEvaluation = useCallback(() => {
    if (debugState?.type === "evaluation") {
      debugState.pendingCall();
    }
  }, [debugState]);

  const handleCancelEvaluation = useCallback(() => {
    setDebugState(null);
    setEvaluationState(null);
    setLessonState((prev) => ({ ...prev, isEvaluating: false }));
    hasEvaluatedRef.current = false;
    // Return to practice mode when cancelling
    setMode("practice");
    onClearRecording();
  }, [onClearRecording, setLessonState, setMode]);

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
            onChange={(e) => setLessonState((prev) => ({ ...prev, prompt: e.target.value }))}
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
                  setLessonState((prev) => ({ ...prev, prompt: suggestion }));
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
