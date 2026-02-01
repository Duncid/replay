import { CompositionSubmenu } from "@/components/CompositionSubmenu";
import { MergeSessionDialog } from "@/components/MergeSessionDialog";
import { TrackContainer } from "@/components/TrackContainer";
import { TrackItem } from "@/components/TrackItem";
import { TrackLoadingItem } from "@/components/TrackLoadingItem";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import type { Composition } from "@/hooks/useCompositions";
import { Note, NoteSequence, PlaybackSegment } from "@/types/noteSequence";
import { beatsToSeconds } from "@/utils/noteSequenceUtils";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { TFunction } from "i18next";
import {
  ChevronDown,
  Download,
  FilePlus,
  Mic,
  MoreHorizontal,
  Music,
  PencilLine,
  Play,
  Save,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Unified entry model
export interface PlayEntry {
  id: string;
  sequence: NoteSequence;
  isAiGenerated: boolean;
}

type GapUnit = "beats" | "measures";
type MergeDirection = "previous" | "next";

interface PlayModeProps {
  bpm: number;
  timeSignature: string;
  onReplay: (sequence: NoteSequence) => void;
  onPlayAll: (
    combinedSequence: NoteSequence,
    segments?: PlaybackSegment[],
  ) => void;
  onStopPlayback: () => void;
  onClearHistory: () => void;
  liveNotes?: Note[];
  isRecording?: boolean;
  isPlaying?: boolean;
  isPlayingAll?: boolean;
  initialHistory?: PlayEntry[];
  onHistoryChange?: (history: PlayEntry[]) => void;
  onRequestImprov?: (sequence: NoteSequence) => void;
  onRequestVariations?: (sequence: NoteSequence) => void;
  playingSequence?: NoteSequence | null;
  isImporting?: boolean;
  importLabel?: string;
}

function normalizeHistory(entries: PlayEntry[]): PlayEntry[] {
  return entries.map((entry) => ({
    ...entry,
    id:
      entry.id ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `track-${Date.now()}-${Math.random()}`),
  }));
}

export function PlayMode({
  bpm,
  timeSignature,
  onReplay,
  onPlayAll,
  onStopPlayback,
  onClearHistory,
  liveNotes = [],
  isRecording = false,
  isPlaying = false,
  isPlayingAll = false,
  initialHistory = [],
  onHistoryChange,
  onRequestImprov,
  onRequestVariations,
  playingSequence,
  isImporting = false,
  importLabel = "Loading...",
}: PlayModeProps) {
  const [history, setHistory] = useState<PlayEntry[]>(() =>
    normalizeHistory(initialHistory),
  );

  // Keep internal history in sync when the parent provides new data
  useEffect(() => {
    setHistory((prev) => {
      const normalized = normalizeHistory(initialHistory);

      const isSame =
        prev.length === normalized.length &&
        prev.every((entry, index) => {
          const candidate = normalized[index];

          return (
            entry.id === candidate.id &&
            entry.sequence === candidate.sequence &&
            entry.isAiGenerated === candidate.isAiGenerated
          );
        });

      return isSame ? prev : normalized;
    });
  }, [initialHistory]);
  const trackRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Configure drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor),
  );

  const beatsPerMeasure = parseInt(timeSignature.split("/")[0]);

  // Notify parent when history changes
  useEffect(() => {
    onHistoryChange?.(history);
  }, [history, onHistoryChange]);

  // Scroll to currently playing track during "Play All"
  useEffect(() => {
    if (isPlayingAll && playingSequence) {
      const playingEntry = history.find(
        (entry) => entry.sequence === playingSequence,
      );
      if (playingEntry) {
        const ref = trackRefs.current.get(playingEntry.id);
        if (ref) {
          ref.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }
    }
  }, [playingSequence, isPlayingAll, history]);

  // Add a single entry (user or AI)
  const addEntry = useCallback(
    (sequence: NoteSequence, isAiGenerated: boolean) => {
      setHistory((prev) => [
        ...prev,
        {
          id: `track-${Date.now()}-${Math.random()}`,
          sequence,
          isAiGenerated,
        },
      ]);
    },
    [],
  );

  // Update an existing entry
  const updateEntry = useCallback((index: number, sequence: NoteSequence) => {
    setHistory((prev) => {
      const newHistory = [...prev];
      if (index >= 0 && index < newHistory.length) {
        newHistory[index] = { ...newHistory[index], sequence };
      }
      return newHistory;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  // Merge two adjacent entries - result inherits isAiGenerated from target (left entry)
  const mergeSessions = useCallback(
    (
      targetIndex: number,
      sourceIndex: number,
      gapValue: number,
      gapUnit: GapUnit,
    ) => {
      setHistory((prev) => {
        if (targetIndex < 0 || sourceIndex >= prev.length) return prev;

        const target = prev[targetIndex];
        const source = prev[sourceIndex];

        // Calculate gap in seconds
        const gapInBeats =
          gapUnit === "measures" ? gapValue * beatsPerMeasure : gapValue;
        const gapSeconds = beatsToSeconds(gapInBeats, bpm);

        // Offset source notes
        const timeOffset = target.sequence.totalTime + gapSeconds;

        const offsetNotes = source.sequence.notes.map((note) => ({
          ...note,
          startTime: note.startTime + timeOffset,
          endTime: note.endTime + timeOffset,
        }));

        const mergedSequence: NoteSequence = {
          ...target.sequence,
          notes: [...target.sequence.notes, ...offsetNotes],
          totalTime: timeOffset + source.sequence.totalTime,
        };

        // Result inherits isAiGenerated and id from TARGET (merge AI into human = human)
        const mergedEntry: PlayEntry = {
          id: target.id,
          sequence: mergedSequence,
          isAiGenerated: target.isAiGenerated,
        };

        // Remove the source and replace target with merged
        const newHistory = [...prev];
        newHistory[targetIndex] = mergedEntry;
        newHistory.splice(sourceIndex, 1);

        return newHistory;
      });
    },
    [bpm, beatsPerMeasure],
  );

  // Build combined sequence from all entries
  const getCombinedSequence = useCallback((): {
    sequence: NoteSequence;
    segments: PlaybackSegment[];
  } | null => {
    if (history.length === 0) return null;

    // Half measure gap between entries
    const measureGapSeconds = beatsToSeconds(beatsPerMeasure / 2, bpm);

    let combinedNotes: Note[] = [];
    const segments: PlaybackSegment[] = [];
    let currentTime = 0;

    history.forEach((entry, index) => {
      const startTime = currentTime;
      const endTime = currentTime + entry.sequence.totalTime;

      segments.push({
        originalSequence: entry.sequence,
        startTime,
        endTime,
      });

      // Add notes with time offset
      const offsetNotes = entry.sequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + currentTime,
        endTime: note.endTime + currentTime,
      }));
      combinedNotes = [...combinedNotes, ...offsetNotes];

      currentTime += entry.sequence.totalTime;

      // Add measure gap if not last
      if (index < history.length - 1) {
        currentTime += measureGapSeconds;
      }
    });

    const sequence: NoteSequence = {
      notes: combinedNotes,
      totalTime: currentTime,
      tempos: [{ time: 0, qpm: bpm }],
      timeSignatures: [
        {
          time: 0,
          numerator: beatsPerMeasure,
          denominator: parseInt(timeSignature.split("/")[1]),
        },
      ],
    };

    return { sequence, segments };
  }, [history, bpm, beatsPerMeasure, timeSignature]);

  // Handle playing all sequences
  const handlePlayAll = useCallback(() => {
    const result = getCombinedSequence();
    if (result) {
      onPlayAll(result.sequence, result.segments);
    }
  }, [getCombinedSequence, onPlayAll]);

  // Create a live sequence from current notes for real-time display
  const liveSequence: NoteSequence | null =
    liveNotes.length > 0
      ? {
          notes: liveNotes,
          totalTime: Math.max(...liveNotes.map((n) => n.endTime), 0),
          tempos: [{ time: 0, qpm: bpm }],
          timeSignatures: [
            {
              time: 0,
              numerator: beatsPerMeasure,
              denominator: parseInt(timeSignature.split("/")[1]),
            },
          ],
        }
      : null;

  const hasValidSessions = history.some(
    (entry) => entry.sequence.notes.length > 0,
  );

  // State for merge dialog
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeEntryIndex, setMergeEntryIndex] = useState(0);
  const [mergeDirection, setMergeDirection] = useState<MergeDirection>("next");

  const openMergeDialog = (index: number, direction: MergeDirection) => {
    setMergeEntryIndex(index);
    setMergeDirection(direction);
    setMergeDialogOpen(true);
  };

  const handleMergeConfirm = (gapValue: number, gapUnit: GapUnit) => {
    const targetIndex =
      mergeDirection === "previous" ? mergeEntryIndex - 1 : mergeEntryIndex;
    const sourceIndex =
      mergeDirection === "previous" ? mergeEntryIndex : mergeEntryIndex + 1;
    mergeSessions(targetIndex, sourceIndex, gapValue, gapUnit);
    setMergeDialogOpen(false);
  };

  // Remove an entry by index
  const removeEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle drag end to reorder tracks
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setHistory((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const render = () => {
    const trackIds = history.map((entry) => entry.id);

    return (
      <>
        <TrackContainer
          scrollDependency={[history.length, liveNotes.length, isImporting]}
          autoScroll={!isPlayingAll && isRecording}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={trackIds}
              strategy={horizontalListSortingStrategy}
            >
              {/* All entries - each with full controls */}
              {history.map((entry, index) => (
                <div
                  key={entry.id}
                  ref={(el) => {
                    if (el) {
                      trackRefs.current.set(entry.id, el);
                    } else {
                      trackRefs.current.delete(entry.id);
                    }
                  }}
                >
                  <TrackItem
                    id={entry.id}
                    sequence={entry.sequence}
                    isPlaying={entry.sequence === playingSequence}
                    onPlay={() => onReplay(entry.sequence)}
                    onStop={onStopPlayback}
                    isFirst={index === 0}
                    isLast={index === history.length - 1 && !isRecording}
                    isAiGenerated={entry.isAiGenerated}
                    onMergePrevious={
                      index > 0
                        ? () => openMergeDialog(index, "previous")
                        : undefined
                    }
                    onMergeNext={
                      index < history.length - 1
                        ? () => openMergeDialog(index, "next")
                        : undefined
                    }
                    onRemove={() => removeEntry(index)}
                    onRequestImprov={onRequestImprov}
                    onRequestVariations={onRequestVariations}
                  />
                </div>
              ))}
            </SortableContext>
          </DndContext>

          {/* Current recording (live) - rightmost */}
          {isRecording && liveSequence && (
            <TrackItem sequence={liveSequence} isRecording={true} />
          )}
          {isImporting && (
            <TrackLoadingItem
              label={importLabel}
              message="Converting MusicXML to MIDI..."
            />
          )}
        </TrackContainer>

        {/* Merge dialog */}
        <MergeSessionDialog
          sessionIndex={mergeEntryIndex}
          totalSessions={history.length}
          onMerge={(direction, gapValue, gapUnit) =>
            handleMergeConfirm(gapValue, gapUnit)
          }
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          initialDirection={mergeDirection}
        />
      </>
    );
  };

  return {
    history,
    addEntry,
    updateEntry,
    clearHistory,
    hasValidSessions,
    handlePlayAll,
    isPlaying,
    isPlayingAll,
    onStopPlayback,
    getCombinedSequence,
    onPlayAll,
    render,
  };
}

export type PlayModeController = ReturnType<typeof PlayMode>;

type TranslationFn = TFunction;

type AIModels = {
  llm: ReadonlyArray<{ value: string; label: string }>;
  magenta: ReadonlyArray<{ value: string; label: string }>;
};

interface PlayModeActionBarProps {
  t: TranslationFn;
  appState: "idle" | "user_playing" | "waiting_for_ai" | "ai_playing";
  isAutoreplyActive: boolean;
  setIsAutoreplyActive: (value: boolean) => void;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  aiModels: AIModels;
  magentaTemperature: number;
  setMagentaTemperature: (value: number) => void;
  isMagentaModel: (value: string) => boolean;
  playMode: PlayModeController;
  isMusicXmlImporting: boolean;
  compositions: Composition[];
  compositionsLoading: boolean;
  currentComposition: Composition | null;
  onUploadAbc: () => void;
  onUploadMusicXml: () => void;
  onUploadMidi: () => void;
  onUploadNoteSequence: () => void;
  onWriteAbc: () => void;
  onWhistleImport: () => void;
  onWriteNoteSequence: () => void;
  onCreateNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onCopyNoteSequence: () => void;
  onSelectComposition: (composition: Composition) => void;
  onDeleteComposition: () => void;
}

export function PlayModeActionBar({
  t,
  appState,
  isAutoreplyActive,
  setIsAutoreplyActive,
  selectedModel,
  setSelectedModel,
  aiModels,
  magentaTemperature,
  setMagentaTemperature,
  isMagentaModel,
  playMode,
  isMusicXmlImporting,
  compositions,
  compositionsLoading,
  currentComposition,
  onUploadAbc,
  onUploadMusicXml,
  onUploadMidi,
  onUploadNoteSequence,
  onWriteAbc,
  onWhistleImport,
  onWriteNoteSequence,
  onCreateNew,
  onSave,
  onSaveAs,
  onCopyNoteSequence,
  onSelectComposition,
  onDeleteComposition,
}: PlayModeActionBarProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          id="autoreply-mode"
          checked={isAutoreplyActive}
          onCheckedChange={setIsAutoreplyActive}
          disabled={appState !== "idle" && appState !== "user_playing"}
        />
        <Label htmlFor="autoreply-mode" className="cursor-pointer">
          {t("controls.autoreply")}
        </Label>
        {isAutoreplyActive && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between">
                  {aiModels.llm.find((m) => m.value === selectedModel)?.label ||
                    aiModels.magenta.find((m) => m.value === selectedModel)
                      ?.label ||
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
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Magenta</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {aiModels.magenta.map((model) => (
                      <DropdownMenuItem
                        key={model.value}
                        onClick={() => setSelectedModel(model.value)}
                      >
                        {model.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            {isMagentaModel(selectedModel) && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    Creativity: {magentaTemperature}%
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-sm mb-1">Creativity</h4>
                      <p className="text-xs text-muted-foreground">
                        0 = predictable, 100 = surprising
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Slider
                        value={[magentaTemperature]}
                        onValueChange={(values) => {
                          const newValue = values[0];
                          console.log(
                            `[Creativity] Slider changed to: ${newValue}`,
                          );
                          setMagentaTemperature(newValue);
                          setTimeout(() => {
                            const saved = window.localStorage.getItem(
                              STORAGE_KEYS.MAGENTA_TEMPERATURE,
                            );
                            console.log(
                              `[Creativity] Saved to localStorage: ${saved}`,
                            );
                          }, 0);
                        }}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span className="font-medium">
                          {magentaTemperature}
                        </span>
                        <span>100</span>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {playMode.history.length > 0 && (
          <Button
            onClick={() => {
              if (playMode.isPlaying) {
                playMode.onStopPlayback();
              } else {
                const seq = playMode.getCombinedSequence();
                if (seq?.sequence) {
                  playMode.onPlayAll(seq.sequence, seq.segments);
                }
              }
            }}
            variant="outline"
            size="sm"
          >
            {playMode.isPlaying ? (
              <Square className="h-4 w-4" fill="currentColor" />
            ) : (
              <Play className="h-4 w-4" fill="currentColor" />
            )}
            {playMode.isPlayingAll ? t("controls.stop") : t("controls.play")}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Insert submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FilePlus />
                {t("menus.insert")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={onUploadAbc}>
                  <Upload />
                  {t("menus.uploadAbc")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onUploadMusicXml}
                  disabled={isMusicXmlImporting}
                >
                  <Upload />
                  {t("menus.uploadMusicXml")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onUploadMidi}>
                  <Upload />
                  {t("menus.uploadMidi")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onUploadNoteSequence}>
                  <Upload />
                  {t("menus.uploadNoteSequence")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onWriteAbc}>
                  <PencilLine />
                  {t("menus.writeAbc")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onWhistleImport}>
                  <Mic />
                  {t("menus.whistleImport")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onWriteNoteSequence}>
                  <Music />
                  {t("menus.writeNoteSequence")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* New */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  disabled={playMode.history.length === 0}
                >
                  <FilePlus />
                  {t("menus.new")}
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("menus.startNewTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("menus.startNewDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("menus.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onCreateNew}>
                    {t("menus.new")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Save */}
            <DropdownMenuItem
              onClick={onSave}
              disabled={playMode.history.length === 0 || compositionsLoading}
            >
              <Save />
              {t("menus.save")}
            </DropdownMenuItem>

            {/* Save as */}
            <DropdownMenuItem
              onClick={onSaveAs}
              disabled={playMode.history.length === 0}
            >
              <Save />
              {t("menus.saveAs")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Export submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={playMode.history.length === 0}>
                <Download />
                {t("menus.export")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={onCopyNoteSequence}>
                  Note Sequence
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Open submenu */}
            <CompositionSubmenu
              compositions={compositions}
              onSelect={onSelectComposition}
              isLoading={compositionsLoading}
            />

            {/* Delete - only when composition loaded */}
            {currentComposition && (
              <>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete composition?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{currentComposition.title}
                        " from the cloud. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("menus.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={onDeleteComposition}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

interface PlayModeTabContentProps {
  playMode: PlayModeController;
}

export function PlayModeTabContent({ playMode }: PlayModeTabContentProps) {
  return (
    <TabsContent
      value="play"
      className="w-full h-full flex-1 min-h-0 flex items-center justify-center overflow-auto"
    >
      {playMode.render()}
    </TabsContent>
  );
}
