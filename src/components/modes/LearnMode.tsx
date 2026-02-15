import { DebugLLMSheet } from "@/components/DebugLLMSheet";
import { FeedbackScreen } from "@/components/FeedbackScreen";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  EvaluationState,
  LessonDebugInfo,
  useLessonEngine,
} from "@/hooks/useLessonEngine";
import {
  useEvaluateStructuredLesson,
  useRegenerateCurriculumLesson,
  useStartCurriculumLesson,
  useTeacherGreeting,
} from "@/hooks/useLessonQueries";
import { fetchTeacherGreeting } from "@/services/lessonService";
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
import { Bug, ChevronDown, FileText, List, Music } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useTranslation } from "react-i18next";

// === Debug menu types (shared with action bar) ===

export interface DebugMenuEntry {
  id: string;
  label: string;
  icon?: React.ReactNode;
  openSheet: () => void;
}

export interface DebugMenuState {
  /** Title shown as the dropdown header, e.g. "Teacher Selection Debug" */
  title: string;
  /** Tune-specific eval fields (only set in tune mode) */
  evalIndex?: number;
  currentEvalIndex?: number;
  evalDecision?: string | null;
  /** General entries visible in the dropdown */
  entries: DebugMenuEntry[];
}

interface LearnModeProps {
  isPlaying: boolean;
  onPlaySequence: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  onStartRecording: () => void;
  isRecording: boolean;
  userRecording: NoteSequence | null;
  onClearRecording: () => void;
  /** When provided (tune mode), complete the current recording immediately (e.g. when playhead reaches end). */
  onCompleteRecordingNow?: () => void;
  language: string;
  notationPreference?: "auto" | "abc" | "solfege";
  model: string;
  debugMode: boolean;
  localUserId?: string | null;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (
    handler: ((noteKey: string) => void) | null,
  ) => void;
  // Metronome control props
  metronomeBpm: number;
  setMetronomeBpm: (bpm: number) => void;
  metronomeTimeSignature: string;
  setMetronomeTimeSignature: (ts: string) => void;
  metronomeIsPlaying: boolean;
  setMetronomeIsPlaying: (playing: boolean) => void;
  setMetronomeFeel?: (feel: LessonFeelPreset) => void;
  setMetronomeSoundType?: (soundType: LessonMetronomeSoundType) => void;
  onEnableFreePractice?: () => void;
}

export function LearnMode({
  isPlaying,
  onPlaySequence,
  onStopPlayback,
  isRecording,
  userRecording,
  onClearRecording,
  onCompleteRecordingNow,
  language,
  notationPreference,
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
  onEnableFreePractice,
}: LearnModeProps) {
  // Debug menu state (unified for lesson + tune modes)
  const [debugMenuState, setDebugMenuState] = useState<DebugMenuState | null>(null);
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
    setShouldFetchGreeting,
    skillToUnlock,
    setSkillToUnlock,
  } = useLessonState();

  // Extract individual values for easier access
  const { prompt, lesson, lastComment, isEvaluating } = lessonState;
  const { mode: lessonMode, evaluationResult } = modeState;
  const { shouldFetchGreeting } = uiState;

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
  const [evaluationState, setEvaluationState] = useState<EvaluationState>(null);
  const [showEvaluationScreen, setShowEvaluationScreen] = useState(false);

  // Debug info captured for non-blocking dropdown access
  const [debugInfo, setDebugInfo] = useState<LessonDebugInfo>({});

  // Debug sheet state (one per LLM call context)
  const [showTeacherSheet, setShowTeacherSheet] = useState(false);
  const [showLessonSheet, setShowLessonSheet] = useState(false);
  const [showEvalSheet, setShowEvalSheet] = useState(false);

  // Tune practice state
  const [activeTuneKey, setActiveTuneKey] = useState<string | null>(null);

  // Refs
  const hasEvaluatedRef = useRef(false);
  const userActionTokenRef = useRef<string>(crypto.randomUUID());

  // Hooks
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Auto-fetch teacher greeting when on welcome screen (go straight to lesson selection)
  useEffect(() => {
    if (lesson.phase === "welcome") {
      setShouldFetchGreeting(true);
    }
  }, [lesson.phase, setShouldFetchGreeting]);

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

  // In debug mode, fetch teacher greeting debug data as soon as we're on the welcome screen
  useEffect(() => {
    if (!debugMode || lesson.phase !== "welcome") return;
    // Skip if already fetched
    if (debugInfo.teacherSelection?.request) return;
    fetchTeacherGreeting({ language, localUserId, debug: true })
      .then((data) => {
        // The debug response has a `prompt` field with the full LLM prompt
        if ("prompt" in data && typeof data.prompt === "string") {
          setDebugInfo((prev) => ({
            ...prev,
            teacherSelection: {
              ...prev.teacherSelection,
              request: data.prompt,
            },
          }));
        }
      })
      .catch((err) => {
        console.error("Failed to fetch teacher greeting debug:", err);
      });
  }, [debugMode, lesson.phase, language, localUserId, debugInfo.teacherSelection?.request]);

  // In debug mode, capture the normal teacher greeting response when it arrives
  useEffect(() => {
    if (!debugMode || !teacherGreeting) return;
    setDebugInfo((prev) => ({
      ...prev,
      teacherSelection: {
        ...prev.teacherSelection,
        response: JSON.stringify(teacherGreeting, null, 2),
      },
    }));
  }, [debugMode, teacherGreeting]);

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
      setEvaluationState,
      setShowEvaluationScreen,
      setDebugInfo,
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
      !isEvaluating
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
    setDebugInfo({});
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

  // When a suggestion is clicked -- always proceeds immediately.
  // In debug mode, fires a parallel debug call to capture the prompt for the dropdown.
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

      // Always proceed immediately with lesson generation
      generateLesson(lessonPrompt, 1, undefined, lessonKey);

      // In debug mode, fire a parallel call to capture the LLM prompt (non-blocking)
      if (debugMode) {
        startCurriculumLessonMutation
          .mutateAsync({
            lessonKey,
            language,
            debug: true,
          })
          .then((data) => {
            if ("prompt" in data && data.prompt) {
              setDebugInfo((prev) => ({
                ...prev,
                lessonGeneration: {
                  ...prev.lessonGeneration,
                  request: data.prompt,
                },
              }));
            }
          })
          .catch((err) => {
            console.error("Failed to fetch lesson debug prompt:", err);
          });
      }
    },
    [debugMode, language, toast, generateLesson, startCurriculumLessonMutation],
  );

  // === Debug menu: build entries from available debug data ===
  useEffect(() => {
    if (!debugMode) {
      setDebugMenuState(null);
      return;
    }

    const entries: DebugMenuEntry[] = [];

    if (debugInfo.teacherSelection?.request || debugInfo.teacherSelection?.response) {
      entries.push({
        id: "teacher-selection",
        label: "Teacher Selection",
        icon: <FileText className="h-4 w-4" />,
        openSheet: () => setShowTeacherSheet(true),
      });
    }

    if (debugInfo.lessonGeneration?.request || debugInfo.lessonGeneration?.response) {
      entries.push({
        id: "lesson-generation",
        label: "Lesson Generation",
        icon: <FileText className="h-4 w-4" />,
        openSheet: () => setShowLessonSheet(true),
      });
    }

    if (debugInfo.evaluation?.request || debugInfo.evaluation?.response) {
      entries.push({
        id: "evaluation",
        label: "Evaluation",
        icon: <Bug className="h-4 w-4" />,
        openSheet: () => setShowEvalSheet(true),
      });
    }

    // Derive title from current phase
    let title = "Debug";
    if (lesson.phase === "welcome") {
      title = "Teacher Selection Debug";
    } else if (lesson.phase === "your_turn") {
      title = "Lesson Debug";
    }

    // Always set the menu state in debug mode (even with no entries yet)
    setDebugMenuState({ title, entries });
  }, [
    debugMode,
    lesson.phase,
    debugInfo.teacherSelection,
    debugInfo.lessonGeneration,
    debugInfo.evaluation,
  ]);

  // Clear debug menu on unmount or when leaving
  useEffect(() => {
    if (!activeTuneKey) return;
    // When entering tune mode, clear lesson debug menu (TuneMode manages its own)
    setDebugMenuState(null);
  }, [activeTuneKey]);

  // Callback for TuneMode to report its debug menu state
  const handleTuneDebugMenuChange = useCallback(
    (tuneMenu: { evalIndex?: number; currentEvalIndex?: number; evalDecision?: string | null; hasPracticePlan: boolean; hasCoachPrompt?: boolean; openPlanSheet: () => void; openEvalDebug: () => void; openCoachPrompt?: () => void } | null) => {
      if (!tuneMenu) {
        setDebugMenuState(null);
        return;
      }

      const entries: DebugMenuEntry[] = [];
      if (tuneMenu.hasCoachPrompt && tuneMenu.openCoachPrompt) {
        entries.push({
          id: "tune-coach-prompt",
          label: "Coach Prompt",
          icon: <FileText className="h-4 w-4" />,
          openSheet: tuneMenu.openCoachPrompt,
        });
      }
      if (tuneMenu.hasPracticePlan) {
        entries.push({
          id: "tune-plan",
          label: "Practice Plan",
          icon: <List className="h-4 w-4" />,
          openSheet: tuneMenu.openPlanSheet,
        });
      }
      entries.push({
        id: "tune-eval",
        label: "Last Evaluation",
        icon: <Bug className="h-4 w-4" />,
        openSheet: tuneMenu.openEvalDebug,
      });

      setDebugMenuState({
        title: "Tune Practice Debug",
        evalIndex: tuneMenu.evalIndex,
        currentEvalIndex: tuneMenu.currentEvalIndex,
        evalDecision: tuneMenu.evalDecision,
        entries,
      });
    },
    [],
  );

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
          notationPreference={notationPreference}
          debugMode={debugMode}
          onLeave={handleLeave}
          onPlaySample={onPlaySequence}
          onStopSample={onStopPlayback}
          isPlayingSample={isPlaying}
          currentRecording={userRecording}
          isRecording={isRecording}
          onRegisterNoteHandler={onRegisterNoteHandler}
          onRegisterNoteOffHandler={onRegisterNoteOffHandler}
          onClearRecording={onClearRecording}
          onPlayheadReachedEnd={onCompleteRecordingNow}
          onTuneDebugMenuChange={handleTuneDebugMenuChange}
        />
      );
    }

    // ============================================
    // LESSON SELECTION (lesson.phase === "welcome")
    // ============================================
    if (lesson.phase === "welcome") {
      // Loading: Generating lesson after selection
      if (isLoading) {
        return (
          <LoadingSpinner message={t("learnMode.generatingLesson")} />
        );
      }

      // Default: Show teacher welcome with suggestions
      return (
        <TeacherWelcome
          greeting={teacherGreeting}
          isLoading={isLoadingTeacher}
          onSelectActivity={handleSelectActivity}
        />
      );
    }

    // ============================================
    // LESSON FLOW (lesson.phase === "your_turn")
    // ============================================
    if (lesson.phase === "your_turn") {
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

  // Debug sheets (rendered outside the main flow, opened from dropdown)
  const renderDebugSheets = () => {
    if (!debugMode) return null;
    return (
      <>
        <DebugLLMSheet
          title="Teacher Selection LLM Call"
          open={showTeacherSheet}
          onOpenChange={setShowTeacherSheet}
          debugCall={debugInfo.teacherSelection}
        />
        <DebugLLMSheet
          title="Lesson Generation LLM Call"
          open={showLessonSheet}
          onOpenChange={setShowLessonSheet}
          debugCall={debugInfo.lessonGeneration}
        />
        <DebugLLMSheet
          title="Evaluation LLM Call"
          open={showEvalSheet}
          onOpenChange={setShowEvalSheet}
          debugCall={debugInfo.evaluation}
        />
      </>
    );
  };

  const handleUserAction = useCallback(() => {
    markUserAction();
  }, [markUserAction]);

  const resetToStart = useCallback(() => {
    handleLeave();
  }, [handleLeave]);

  const switchToFreePractice = useCallback(() => {
    handleLeave();
    onEnableFreePractice?.();
  }, [handleLeave, onEnableFreePractice]);

  // Expose lesson mode and tune mode state to parent so it can control recording
  return {
    lesson,
    render,
    renderDebugSheets,
    handleUserAction,
    lessonMode,
    isInTuneMode: activeTuneKey !== null,
    resetToStart,
    debugMenuState,
    switchToFreePractice,
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
  debugMenuState?: DebugMenuState | null;
  onSwitchToFreePractice?: () => void;
}

export function LearnModeActionBar({
  t,
  selectedModel,
  setSelectedModel,
  aiModels,
  debugMode,
  setDebugMode,
  onEnableFreePractice,
  debugMenuState,
  onSwitchToFreePractice,
}: LearnModeActionBarProps) {
  const hasEntries = debugMenuState && debugMenuState.entries.length > 0;
  const hasTuneStats =
    debugMenuState?.evalIndex !== undefined ||
    debugMenuState?.currentEvalIndex !== undefined;

  return (
    <>
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
      {debugMode ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Debug menu">
              <Bug />
              <ChevronDown className="opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            {aiModels.llm.map((model) => (
              <DropdownMenuItem
                key={model.value}
                onSelect={() => setSelectedModel(model.value)}
              >
                {model.value === selectedModel ? "✓ " : ""}
                {model.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{debugMenuState?.title || "Debug"}</DropdownMenuLabel>
            {/* Tune-specific eval stats */}
            {hasTuneStats && (
              <div className="px-2 py-1.5 text-sm flex flex-col items-start gap-0.5 text-muted-foreground">
                <span>
                  Eval index: {debugMenuState?.evalIndex ?? "-"} /{" "}
                  {debugMenuState?.currentEvalIndex ?? "-"}
                </span>
                {debugMenuState?.evalDecision ? (
                  <span className="text-[10px] text-muted-foreground/80">
                    {debugMenuState.evalDecision}
                  </span>
                ) : null}
              </div>
            )}
            {/* Dynamic entries */}
            {hasEntries ? (
              debugMenuState?.entries.map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  onSelect={() => entry.openSheet()}
                >
                  {entry.icon}
                  {entry.label}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No debug data yet
              </div>
            )}
            {/* Free practice option */}
            {onSwitchToFreePractice && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mode</DropdownMenuLabel>
                <DropdownMenuItem onSelect={onSwitchToFreePractice}>
                  <Music className="h-4 w-4" />
                  Free Practice
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
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
        <>
          {learnMode.render()}
          {learnMode.renderDebugSheets()}
        </>
      )}
    </TabsContent>
  );
}
