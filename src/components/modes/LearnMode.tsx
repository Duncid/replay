import { DebugLLMSheet } from "@/components/DebugLLMSheet";
import { FreePracticeMode } from "@/components/modes/FreePracticeMode";
import { LessonMode } from "@/components/modes/LessonMode";
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
import type { LessonDebugInfo } from "@/hooks/useLessonEngine";
import { useTeacherGreeting } from "@/hooks/useLessonQueries";
import { fetchTeacherGreeting } from "@/services/lessonService";
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
  const [shouldFetchGreeting, setShouldFetchGreeting] = useState(false);

  // === React Query Hooks ===
  const {
    data: teacherGreeting,
    isLoading: isLoadingTeacher,
    error: teacherGreetingError,
  } = useTeacherGreeting(language, localUserId, shouldFetchGreeting);

  // Debug info captured for non-blocking dropdown access (teacher selection only; lesson/eval debug lives in LessonMode)
  const [debugInfo, setDebugInfo] = useState<LessonDebugInfo>({});

  // Debug sheet state (one per LLM call context)
  const [showTeacherSheet, setShowTeacherSheet] = useState(false);
  const [showLessonSheet, setShowLessonSheet] = useState(false);
  const [showEvalSheet, setShowEvalSheet] = useState(false);
  const [showLessonInfoSheet, setShowLessonInfoSheet] = useState(false);

  // Tune and lesson practice state (key-based routing, like TuneMode)
  const [activeTuneKey, setActiveTuneKey] = useState<string | null>(null);
  const [activeLessonKey, setActiveLessonKey] = useState<string | null>(null);
  const [isLessonLoading, setIsLessonLoading] = useState(false);

  // Hooks
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Auto-fetch teacher greeting when on welcome screen (no tune or lesson selected)
  const isOnWelcomeScreen = !activeTuneKey && !activeLessonKey;
  useEffect(() => {
    if (isOnWelcomeScreen) {
      setShouldFetchGreeting(true);
    }
  }, [isOnWelcomeScreen, setShouldFetchGreeting]);

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
    if (!debugMode || !isOnWelcomeScreen) return;
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
  }, [debugMode, isOnWelcomeScreen, language, localUserId, debugInfo.teacherSelection?.request]);

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

  const handleLeave = useCallback(() => {
    setDebugInfo({});
    onClearRecording();
    setShouldFetchGreeting(false);
    setMetronomeIsPlaying(false);
    setActiveTuneKey(null);
    setActiveLessonKey(null);
    queryClient.invalidateQueries({ queryKey: ["teacherGreeting"] });
  }, [
    onClearRecording,
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

      const lessonKey = suggestion.activityKey || suggestion.lessonKey || "";
      if (lessonKey) {
        setActiveLessonKey(lessonKey);
      } else {
        toast({
          title: "Error",
          description: "Lesson key not found",
          variant: "destructive",
        });
      }
    },
    [toast],
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

    if (activeLessonKey) {
      entries.push(
        { id: "lesson-generation", label: "Lesson Generation", icon: <FileText className="h-4 w-4" />, openSheet: () => setShowLessonSheet(true) },
        { id: "evaluation", label: "Last Evaluation", icon: <Bug className="h-4 w-4" />, openSheet: () => setShowEvalSheet(true) },
        { id: "lesson-info", label: "Lesson info", icon: <FileText className="h-4 w-4" />, openSheet: () => setShowLessonInfoSheet(true) }
      );
    }

    let title = "Debug";
    if (isOnWelcomeScreen) title = "Teacher Selection Debug";
    else if (activeLessonKey) title = "Lesson Debug";

    setDebugMenuState({ title, entries });
  }, [
    debugMode,
    isOnWelcomeScreen,
    activeLessonKey,
    debugInfo.teacherSelection,
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

    if (activeLessonKey) {
      return (
        <LessonMode
          lessonKey={activeLessonKey}
          onLeave={handleLeave}
          onLoadingChange={setIsLessonLoading}
          isPlaying={isPlaying}
          onPlaySequence={onPlaySequence}
          onStopPlayback={onStopPlayback}
          isRecording={isRecording}
          userRecording={userRecording}
          onClearRecording={onClearRecording}
          onCompleteRecordingNow={onCompleteRecordingNow}
          language={language}
          notationPreference={notationPreference}
          debugMode={debugMode}
          localUserId={localUserId}
          metronomeBpm={metronomeBpm}
          metronomeTimeSignature={metronomeTimeSignature}
          setMetronomeBpm={setMetronomeBpm}
          setMetronomeTimeSignature={setMetronomeTimeSignature}
          applyMetronomeSettings={applyMetronomeSettings}
          onRegisterNoteHandler={onRegisterNoteHandler}
          onRegisterNoteOffHandler={onRegisterNoteOffHandler}
          showLessonSheet={showLessonSheet}
          setShowLessonSheet={setShowLessonSheet}
          showEvalSheet={showEvalSheet}
          setShowEvalSheet={setShowEvalSheet}
          showLessonInfoSheet={showLessonInfoSheet}
          setShowLessonInfoSheet={setShowLessonInfoSheet}
        />
      );
    }

    return (
      <TeacherWelcome
        greeting={teacherGreeting}
        isLoading={isLoadingTeacher}
        onSelectActivity={handleSelectActivity}
      />
    );
  };

  // Debug sheets: only Teacher Selection here; Lesson Generation / Evaluation / Info are inside LessonMode
  const renderDebugSheets = () => {
    if (!debugMode) return null;
    return (
      <DebugLLMSheet
        title="Teacher Selection LLM Call"
        open={showTeacherSheet}
        onOpenChange={setShowTeacherSheet}
        debugCall={debugInfo.teacherSelection}
      />
    );
  };

  const handleUserAction = useCallback(() => {
    // No-op: user action cancellation is handled inside LessonMode / TuneMode
  }, []);

  const resetToStart = useCallback(() => {
    handleLeave();
  }, [handleLeave]);

  const switchToFreePractice = useCallback(() => {
    handleLeave();
    onEnableFreePractice?.();
  }, [handleLeave, onEnableFreePractice]);

  const isInLessonPractice = activeLessonKey != null && !isLessonLoading;

  return {
    render,
    renderDebugSheets,
    handleUserAction,
    isInLessonPractice,
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
