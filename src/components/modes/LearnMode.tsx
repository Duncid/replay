import { TuneLibrary } from "@/components/TuneLibrary";
import { TuneMode } from "@/components/modes/TuneMode";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TabsContent } from "@/components/ui/tabs";
import type { LessonFeelPreset, LessonMetronomeSoundType } from "@/types/learningSession";
import type { NoteSequence } from "@/types/noteSequence";
import type { TFunction } from "i18next";
import { Bug, ChevronDown, FileText, List } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import type { ComponentProps } from "react";
import type { FreePracticeMode } from "@/components/modes/FreePracticeMode";

export interface DebugMenuEntry {
  id: string;
  label: string;
  icon?: ReactNode;
  openSheet: () => void;
}

export interface DebugMenuState {
  title: string;
  evalIndex?: number;
  currentEvalIndex?: number;
  evalDecision?: string | null;
  entries: DebugMenuEntry[];
}

export interface LearnModeProps {
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
  /** Debug mode: tapping a tune opens its review screen in the tune manager instead of practice. */
  onReviewTune?: (tuneKey: string) => void;
  localUserId?: string | null;
  profileLoading?: boolean;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (
    handler: ((noteKey: string) => void) | null,
  ) => void;
  onRegisterExpectedNotesProvider?: (
    provider:
      | (() => { mids: number[]; t0: number; t1: number } | null)
      | null,
  ) => void;
  /** Curriculum lesson target pitches for mic (Tune mode uses onRegisterExpectedNotesProvider). */
  onRegisterLessonExpectedNotesProvider?: (
    provider:
      | (() => { mids: number[]; t0: number; t1: number } | null)
      | null,
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

// Retain the parent recording contract while the student flow is tune-only.
const idleLesson = { phase: "welcome" as const, targetSequence: { notes: [] } };
const handleUserAction = () => {};

export function LearnMode(props: LearnModeProps) {
  const [activeTuneKey, setActiveTuneKey] = useState<string | null>(null);
  const [debugMenuState, setDebugMenuState] = useState<DebugMenuState | null>(null);
  const { onStopPlayback, onClearRecording, setMetronomeIsPlaying } = props;
  const resetToStart = useCallback(() => {
    onStopPlayback?.();
    onClearRecording();
    setMetronomeIsPlaying(false);
    setActiveTuneKey(null);
    setDebugMenuState(null);
  }, [onStopPlayback, onClearRecording, setMetronomeIsPlaying]);

  const handleTuneDebugMenuChange = useCallback((menu: {
    evalIndex?: number; currentEvalIndex?: number; evalDecision?: string | null;
    hasPracticePlan: boolean; hasCoachPrompt?: boolean;
    openPlanSheet: () => void; openEvalDebug: () => void; openCoachPrompt?: () => void;
  } | null) => {
    if (!menu) { setDebugMenuState(null); return; }
    const entries: DebugMenuEntry[] = [];
    if (menu.hasCoachPrompt && menu.openCoachPrompt) {
      entries.push({ id: "tune-coach-prompt", label: "debugMenu.coach", icon: <FileText className="size-4" />, openSheet: menu.openCoachPrompt });
    }
    if (menu.hasPracticePlan) {
      entries.push({ id: "tune-plan", label: "practice.plan", icon: <List className="size-4" />, openSheet: menu.openPlanSheet });
    }
    entries.push({ id: "tune-eval", label: "debugMenu.lastEval", icon: <Bug className="size-4" />, openSheet: menu.openEvalDebug });
    setDebugMenuState({ title: "debugMenu.practice", evalIndex: menu.evalIndex, currentEvalIndex: menu.currentEvalIndex, evalDecision: menu.evalDecision, entries });
  }, []);

  const render = () => activeTuneKey ? (
    <TuneMode
      key={`${props.localUserId ?? "guest"}:${activeTuneKey}`}
      tuneKey={activeTuneKey}
      localUserId={props.localUserId}
      language={props.language}
      notationPreference={props.notationPreference}
      debugMode={props.debugMode}
      onLeave={resetToStart}
      onPlaySample={props.onPlaySequence}
      onStopSample={props.onStopPlayback}
      isPlayingSample={props.isPlaying}
      currentRecording={props.userRecording}
      isRecording={props.isRecording}
      onRegisterNoteHandler={props.onRegisterNoteHandler}
      onRegisterNoteOffHandler={props.onRegisterNoteOffHandler}
      onRegisterExpectedNotesProvider={props.onRegisterExpectedNotesProvider}
      onClearRecording={props.onClearRecording}
      onPlayheadReachedEnd={props.onCompleteRecordingNow}
      onTuneDebugMenuChange={handleTuneDebugMenuChange}
    />
  ) : <TuneLibrary profileLoading={props.profileLoading} localUserId={props.localUserId} onSelectTune={key => {
    if (props.debugMode && props.onReviewTune) { props.onReviewTune(key); return; }
    onClearRecording();
    setActiveTuneKey(key);
  }} />;

  return {
    lesson: idleLesson,
    lessonMode: "practice" as const,
    render,
    renderDebugSheets: () => null,
    handleUserAction,
    isInTuneMode: activeTuneKey !== null,
    resetToStart,
    debugMenuState: props.debugMode ? debugMenuState : null,
  };
}

export type LearnModeController = ReturnType<typeof LearnMode>;

interface LearnModeActionBarProps {
  t: TFunction;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  aiModels: { llm: ReadonlyArray<{ value: string; label: string }> };
  debugMode: boolean;
  onEnableFreePractice: () => void;
  debugMenuState?: DebugMenuState | null;
}

export function LearnModeActionBar({ t, selectedModel, setSelectedModel, aiModels, debugMode, debugMenuState }: LearnModeActionBarProps) {
  return <>
    {debugMode && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" title={t("debugMenu.menu")}><Bug /><ChevronDown className="opacity-50" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("debugMenu.model")}</DropdownMenuLabel>
        {aiModels.llm.map(model => <DropdownMenuItem key={model.value} onSelect={() => setSelectedModel(model.value)}>{model.value === selectedModel ? "✓ " : ""}{model.label}</DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t(debugMenuState?.title ?? "debugMenu.practice")}</DropdownMenuLabel>
        {debugMenuState?.evalIndex !== undefined && <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("debugMenu.index", { index: debugMenuState.evalIndex, current: debugMenuState.currentEvalIndex ?? "-" })}</div>}
        {debugMenuState?.evalDecision && <div className="max-w-xs px-2 text-xs text-muted-foreground break-words">{debugMenuState.evalDecision}</div>}
        {debugMenuState?.entries.map(entry => <DropdownMenuItem key={entry.id} onSelect={entry.openSheet}>{entry.icon}{t(entry.label)}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
  </>;
}

interface LearnModeTabContentProps {
  learnModeType: "free-practice" | "curriculum";
  freePracticeProps: ComponentProps<typeof FreePracticeMode>;
  learnMode: LearnModeController;
}

export function LearnModeTabContent({ learnMode }: LearnModeTabContentProps) {
  return <TabsContent value="learn" className="w-full h-full flex-1 min-h-0 flex items-start justify-center overflow-auto">{learnMode.render()}</TabsContent>;
}
