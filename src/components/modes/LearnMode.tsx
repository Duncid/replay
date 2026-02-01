import { EvaluationDebugCard } from "@/components/EvaluationDebugCard";
import { FeedbackScreen } from "@/components/FeedbackScreen";
import { LessonDebugCard } from "@/components/LessonDebugCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FreePracticeMode } from "@/components/modes/FreePracticeMode";
import { LessonEvaluation } from "@/components/modes/LessonEvaluation";
import { LessonPractice } from "@/components/modes/LessonPractice";
import { TuneMode } from "@/components/modes/TuneMode";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DebugState,
  EvaluationState,
  useLessonEngine,
} from "@/hooks/useLessonEngine";
import {
  useEvaluateStructuredLesson,
  useRegenerateCurriculumLesson,
  useStartCurriculumLesson,
  useTeacherGreeting,
} from "@/hooks/useLessonQueries";
import { useLessonState } from "@/hooks/useLessonState";
import {
  LessonFeelPreset,
  LessonMetronomeSettings,
  LessonMetronomeSoundType,
  TeacherSuggestion,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
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
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (handler: ((noteKey: string) => void) | null) => void;
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
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
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

  // Tune practice state
  const [activeTuneKey, setActiveTuneKey] = useState<string | null>(null);

  // Refs
  const hasEvaluatedRef = useRef(false);
  const userActionTokenRef = useRef<string>(crypto.randomUUID());

  // Hooks
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Fetch teacher greeting when user clicks Start
  const handleStartTeacherGreet = useCallback(() => {
    console.log(`[LearnMode] Start clicked: user=${localUserId ?? "unknown"}`);
    setShouldFetchGreeting(true);
  }, [localUserId]);

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
    ],
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
    },
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
  }, [
    lesson.phase,
    lessonMode,
    userRecording,
    isRecording,
    isEvaluating,
    evaluateAttempt,
    debugState,
  ]);

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
  }, [
    lessonMode,
    onClearRecording,
    setMode,
    setEvaluationResult,
    setLessonState,
  ]);

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
    setMetronomeIsPlaying(false);
    setActiveTuneKey(null); // Reset tune mode
    // Invalidate teacher greeting cache to force fresh suggestions on next Start
    queryClient.invalidateQueries({ queryKey: ["teacherGreeting"] });
  }, [
    markUserAction,
    onClearRecording,
    resetLesson,
    setLessonState,
    setMode,
    setShouldFetchGreeting,
    queryClient,
    setMetronomeIsPlaying,
  ]);

  // When a suggestion is clicked, fetch the debug prompt first (only in debug mode)
  const handleSelectActivity = useCallback(
    async (suggestion: TeacherSuggestion) => {
      // Handle tune selection - start TuneMode
      if (suggestion.activityType === "tune") {
        const tuneKey = suggestion.activityKey || "";
        if (tuneKey) {
          setActiveTuneKey(tuneKey);
        } else {
          toast({
            title: "Error",
            description: "Tune key not found",
            variant: "destructive",
          });
        }
        return;
      }

      // Build prompt from suggestion
      const lessonPrompt = `${suggestion.label}: ${suggestion.why}`;
      const lessonKey = suggestion.activityKey || suggestion.lessonKey || "";

      // In debug mode, fetch debug prompt and show debug card
      if (debugMode) {
        setLoadingLessonDebug(true);

        try {
          const data = await startCurriculumLessonMutation.mutateAsync({
            lessonKey,
            language,
            debug: true,
          });

          if ("prompt" in data && data.prompt) {
            setDebugState({
              type: "lesson",
              suggestion: { ...suggestion, lessonKey },
              prompt: data.prompt,
            });
          } else {
            throw new Error("Debug mode not returning expected data");
          }
        } catch (err) {
          console.error("Failed to fetch lesson debug:", err);
          toast({
            title: "Error",
            description:
              err instanceof Error ? err.message : "Failed to prepare lesson",
            variant: "destructive",
          });
        } finally {
          setLoadingLessonDebug(false);
        }
      } else {
        // In normal mode, directly start the lesson
        generateLesson(lessonPrompt, 1, undefined, lessonKey);
      }
    },
    [debugMode, language, toast, generateLesson, startCurriculumLessonMutation],
  );

  // Start the actual lesson after seeing the debug prompt
  const handleStartLesson = useCallback(() => {
    if (debugState?.type !== "lesson") return;

    const suggestion = debugState.suggestion;
    const prompt = `${suggestion.label}: ${suggestion.why}`;
    const lessonKey = suggestion.activityKey || suggestion.lessonKey || "";
    generateLesson(prompt, 1, undefined, lessonKey);
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
          description:
            error instanceof Error
              ? error.message
              : "Failed to evaluate performance",
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

  const render = () => {
    // ============================================
    // TUNE PRACTICE MODE (activeTuneKey is set)
    // ============================================
    if (activeTuneKey) {
      return (
        <TuneMode
          tuneKey={activeTuneKey}
          localUserId={localUserId}
          language={language}
          debugMode={debugMode}
          onLeave={handleLeave}
          onPlaySample={onPlaySequence}
          isPlayingSample={isPlaying}
          currentRecording={userRecording}
          isRecording={isRecording}
          onRegisterNoteHandler={onRegisterNoteHandler}
          onRegisterNoteOffHandler={onRegisterNoteOffHandler}
        />
      );
    }

    // ============================================
    // LESSON SELECTION (lesson.phase === "welcome")
    // ============================================
    if (lesson.phase === "welcome") {
      // Debug: Show lesson debug card before starting (highest priority)
      if (debugMode && debugState?.type === "lesson" && !isLoading) {
        return (
          <LessonDebugCard
            suggestion={debugState.suggestion}
            prompt={debugState.prompt}
            isLoading={isLoading}
            onStart={handleStartLesson}
            onCancel={handleCancelLessonDebug}
          />
        );
      }

      // Loading: Generating lesson after selection
      if (isLoading || isLoadingLessonDebug) {
        return (
          <LoadingSpinner
            message={
              isLoadingLessonDebug
                ? t("learnMode.preparingLesson")
                : t("learnMode.generatingLesson")
            }
          />
        );
      }

      // Default: Show teacher welcome with suggestions
      return (
        <TeacherWelcome
          greeting={teacherGreeting}
          isLoading={isLoadingTeacher}
          onSelectActivity={handleSelectActivity}
          onStart={handleStartTeacherGreet}
          language={language}
          localUserId={localUserId}
          debugMode={debugMode}
        />
      );
    }

    // ============================================
    // LESSON FLOW (lesson.phase === "your_turn")
    // ============================================
    if (lesson.phase === "your_turn") {
      // Debug: Show evaluation debug card (before evaluation LLM call) - highest priority
      if (debugState?.type === "evaluation") {
        return (
          <EvaluationDebugCard
            prompt={debugState.prompt}
            userSequence={debugState.userSequence}
            evaluationType={debugState.evaluationType}
            onProceed={handleProceedEvaluation}
            onCancel={handleCancelEvaluation}
            evaluationOutput={
              evaluationState?.type === "structured"
                ? evaluationState.evaluationOutput
                : undefined
            }
          />
        );
      }

      // Feedback: Show feedback screen after evaluation
      if (showEvaluationScreen) {
        return (
          <FeedbackScreen
            evaluation={
              evaluationState?.type === "structured"
                ? evaluationState.evaluationOutput.evaluation
                : "close"
            }
            feedbackText={
              evaluationState?.type === "structured"
                ? evaluationState.evaluationOutput.feedbackText
                : ""
            }
            awardedSkills={
              evaluationState?.type === "structured" &&
              evaluationState.awardedSkillsWithTitles?.length
                ? evaluationState.awardedSkillsWithTitles
                : undefined
            }
            debugMode={debugMode}
            evaluationOutput={
              evaluationState?.type === "structured"
                ? evaluationState.evaluationOutput
                : undefined
            }
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
        );
      }

      // Evaluation: User is recording their attempt
      if (lessonMode === "evaluation") {
        return (
          <LessonEvaluation
            instruction={lesson.instruction}
            isEvaluating={isEvaluating}
            isLoading={isLoading || isPlaying}
            isRecording={isRecording}
            onBackToPractice={handleEvaluate}
            onLeave={handleLeave}
            trackTitle={lesson.trackTitle}
            skillToUnlock={skillToUnlock}
            debugMode={debugMode}
            difficulty={lesson.difficulty}
          />
        );
      }

      // Practice: User is practicing the lesson
      return (
        <LessonPractice
          instruction={lesson.instruction}
          isLoading={isLoading || isPlaying}
          onPlay={handlePlay}
          onStartEvaluation={handleEvaluate}
          onLeave={handleLeave}
          trackTitle={lesson.trackTitle}
          skillToUnlock={skillToUnlock}
          debugMode={debugMode}
          difficulty={lesson.difficulty}
        />
      );
    }

    return null;
  };

  const handleUserAction = useCallback(() => {
    markUserAction();
  }, [markUserAction]);

  const resetToStart = useCallback(() => {
    handleLeave();
  }, [handleLeave]);

  // Expose lesson mode and tune mode state to parent so it can control recording
  return {
    lesson,
    render,
    handleUserAction,
    lessonMode,
    isInTuneMode: activeTuneKey !== null,
    resetToStart,
  };
}

export type LearnModeController = ReturnType<typeof LearnMode>;

type TranslationFn = TFunction;

type AIModels = {
  llm: ReadonlyArray<{ value: string; label: string }>;
};

interface LearnModeActionBarProps {
  t: TranslationFn;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  aiModels: AIModels;
  debugMode: boolean;
  setDebugMode: (value: boolean) => void;
  onEnableFreePractice: () => void;
}

export function LearnModeActionBar({
  t,
  selectedModel,
  setSelectedModel,
  aiModels,
  debugMode,
  setDebugMode,
  onEnableFreePractice,
}: LearnModeActionBarProps) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="justify-between">
            {aiModels.llm.find((m) => m.value === selectedModel)?.label ||
              selectedModel}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {aiModels.llm.map((model) => (
            <DropdownMenuItem
              key={model.value}
              onClick={() => setSelectedModel(model.value)}
            >
              {model.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-2 ml-auto">
        <Label
          htmlFor="debug-mode"
          className="cursor-pointer text-sm text-muted-foreground"
        >
          Debug
        </Label>
        <Switch
          id="debug-mode"
          checked={debugMode}
          onCheckedChange={(checked) => setDebugMode(checked === true)}
        />
      </div>
      {debugMode && (
        <Button variant="outline" size="sm" onClick={onEnableFreePractice}>
          {t("learnMode.freePractice", "Free Practice")}
        </Button>
      )}
    </>
  );
}

type FreePracticeModeProps = ComponentProps<typeof FreePracticeMode>;

interface LearnModeTabContentProps {
  learnModeType: "free-practice" | "curriculum";
  freePracticeProps: FreePracticeModeProps;
  learnMode: LearnModeController;
}

export function LearnModeTabContent({
  learnModeType,
  freePracticeProps,
  learnMode,
}: LearnModeTabContentProps) {
  return (
    <TabsContent
      value="learn"
      className="w-full h-full flex-1 min-h-0 flex items-center justify-center overflow-auto"
    >
      {learnModeType === "free-practice" ? (
        <FreePracticeMode {...freePracticeProps} />
      ) : (
        learnMode.render()
      )}
    </TabsContent>
  );
}
