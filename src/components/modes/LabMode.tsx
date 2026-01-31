import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNoteColorForNoteName } from "@/constants/noteColors";
import { useToast } from "@/hooks/use-toast";
import { usePublishedTuneKeys, useTuneAssets } from "@/hooks/useTuneQueries";
import { supabase } from "@/integrations/supabase/client";
import type { NoteSequence } from "@/types/noteSequence";
import type {
  TuneAssembly,
  TuneBriefing,
  TuneNugget,
} from "@/types/tuneAssets";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import {
  bundleSingleTuneAssets,
  getAssemblyDspXml,
  getAssemblyNs,
  getAssemblyXml,
  getLocalAssemblyIds,
  getLocalNuggetIds,
  getLocalTuneKeys,
  getNuggetDspXml,
  getNuggetNs,
  getNuggetXml,
  getTuneDspXml,
  getTuneNs,
  getTuneXml,
} from "@/utils/tuneAssetBundler";
import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Upload } from "lucide-react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OpenSheetMusicDisplayView,
  type OpenSheetMusicDisplayViewHandle,
} from "../OpenSheetMusicDisplayView";

interface LabModeProps {
  onPlaySequence?: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  isPlaying?: boolean;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
}

const EMPTY_SEQUENCE: NoteSequence = { notes: [], totalTime: 0 };

type TuneSource = "published" | "local";
type TargetType = "full" | "nuggets" | "assemblies";

export const LabMode = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onRegisterNoteHandler,
}: LabModeProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selection state
  const [selectedSource, setSelectedSource] = useState<TuneSource>("published");
  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedTarget, setSelectedTarget] =
    useState<TargetType>("assemblies");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  // Publish dialog state
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishMode, setPublishMode] = useState<"create" | string>("create");
  const [newTuneTitle, setNewTuneTitle] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  // Fetch published tune keys from database
  const { data: tuneList, isLoading: isLoadingList } = usePublishedTuneKeys();
  const publishedTuneKeys = useMemo(
    () => new Set(tuneList?.map((t) => t.tune_key) ?? []),
    [tuneList],
  );

  // Get local tune keys from file system
  const localTuneKeys = useMemo(() => getLocalTuneKeys(), []);
  const unpublishedTuneKeys = useMemo(
    () => localTuneKeys.filter((key) => !publishedTuneKeys.has(key)),
    [localTuneKeys, publishedTuneKeys],
  );

  // Auto-select first tune when list loads
  useEffect(() => {
    if (!selectedTune) {
      if (publishedTuneKeys.size > 0) {
        const firstPublished = Array.from(publishedTuneKeys)[0];
        setSelectedTune(firstPublished);
        setSelectedSource("published");
      } else if (unpublishedTuneKeys.length > 0) {
        setSelectedTune(unpublishedTuneKeys[0]);
        setSelectedSource("local");
      }
    }
  }, [publishedTuneKeys, unpublishedTuneKeys, selectedTune]);

  // Fetch tune assets from database (only when published source)
  const { data: tuneAssets, isLoading: isLoadingAssets } = useTuneAssets(
    selectedSource === "published" ? selectedTune : null,
  );

  // Derive nugget/assembly IDs based on source
  const nuggetIds = useMemo(() => {
    if (selectedSource === "published") {
      const briefing = tuneAssets?.briefing as TuneBriefing | null;
      return briefing?.teachingOrder ?? [];
    }
    return getLocalNuggetIds(selectedTune);
  }, [selectedSource, tuneAssets, selectedTune]);

  const assemblyIds = useMemo(() => {
    if (selectedSource === "published") {
      const briefing = tuneAssets?.briefing as TuneBriefing | null;
      return briefing?.assemblyOrder ?? [];
    }
    return getLocalAssemblyIds(selectedTune);
  }, [selectedSource, tuneAssets, selectedTune]);

  // Helper functions for dropdown (for published tunes from list)
  const getNuggetIdsForTune = useCallback(
    (tuneKey: string, source: TuneSource) => {
      if (source === "published") {
        const tuneInfo = tuneList?.find((t) => t.tune_key === tuneKey);
        return tuneInfo?.briefing?.teachingOrder ?? [];
      }
      return getLocalNuggetIds(tuneKey);
    },
    [tuneList],
  );

  const getAssemblyIdsForTune = useCallback(
    (tuneKey: string, source: TuneSource) => {
      if (source === "published") {
        const tuneInfo = tuneList?.find((t) => t.tune_key === tuneKey);
        return tuneInfo?.briefing?.assemblyOrder ?? [];
      }
      return getLocalAssemblyIds(tuneKey);
    },
    [tuneList],
  );

  // Reset item selection when tune or target changes
  useEffect(() => {
    if (selectedTarget === "full") {
      if (selectedItemId) setSelectedItemId("");
      return;
    }
    const options = selectedTarget === "assemblies" ? assemblyIds : nuggetIds;
    if (!options.length) {
      if (selectedItemId) setSelectedItemId("");
      return;
    }
    if (!selectedItemId || !options.includes(selectedItemId)) {
      setSelectedItemId(options[0]);
    }
  }, [assemblyIds, nuggetIds, selectedItemId, selectedTarget, selectedTune]);

  // Derive sequences based on source
  const labSequence = useMemo(() => {
    if (selectedSource === "published") {
      if (!tuneAssets) return EMPTY_SEQUENCE;
      if (selectedTarget === "full") {
        return (tuneAssets.note_sequence as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      if (selectedTarget === "assemblies") {
        const assemblies = tuneAssets.assemblies as TuneAssembly[] | null;
        const assembly = assemblies?.find((a) => a.id === selectedItemId);
        return assembly?.noteSequence ?? EMPTY_SEQUENCE;
      }
      const nuggets = tuneAssets.nuggets as TuneNugget[] | null;
      const nugget = nuggets?.find((n) => n.id === selectedItemId);
      return nugget?.noteSequence ?? EMPTY_SEQUENCE;
    }

    // Local source
    if (!selectedTune) return EMPTY_SEQUENCE;
    if (selectedTarget === "full") {
      return (getTuneNs(selectedTune) as NoteSequence) ?? EMPTY_SEQUENCE;
    }
    if (selectedTarget === "assemblies") {
      return (
        (getAssemblyNs(selectedTune, selectedItemId) as NoteSequence) ??
        EMPTY_SEQUENCE
      );
    }
    return (
      (getNuggetNs(selectedTune, selectedItemId) as NoteSequence) ??
      EMPTY_SEQUENCE
    );
  }, [
    selectedSource,
    tuneAssets,
    selectedTarget,
    selectedItemId,
    selectedTune,
  ]);

  // Derive full XMLs based on source
  const xmlFull = useMemo(() => {
    if (selectedSource === "published") {
      if (!tuneAssets) return null;
      if (selectedTarget === "full") return tuneAssets.tune_xml;
      if (selectedTarget === "assemblies") {
        const xmls = tuneAssets.assembly_xmls as Record<string, string> | null;
        return xmls?.[selectedItemId] ?? null;
      }
      const xmls = tuneAssets.nugget_xmls as Record<string, string> | null;
      return xmls?.[selectedItemId] ?? null;
    }

    // Local source
    if (!selectedTune) return null;
    if (selectedTarget === "full") return getTuneXml(selectedTune);
    if (selectedTarget === "assemblies") {
      return getAssemblyXml(selectedTune, selectedItemId);
    }
    return getNuggetXml(selectedTune, selectedItemId);
  }, [
    selectedSource,
    tuneAssets,
    selectedTarget,
    selectedItemId,
    selectedTune,
  ]);

  // Derive DSP XMLs based on source
  const xmlDsp = useMemo(() => {
    if (selectedSource === "published") {
      if (!tuneAssets) return null;
      if (selectedTarget === "full") return tuneAssets.tune_dsp_xml;
      if (selectedTarget === "assemblies") {
        const xmls = tuneAssets.assembly_dsp_xmls as Record<
          string,
          string
        > | null;
        return xmls?.[selectedItemId] ?? null;
      }
      const xmls = tuneAssets.nugget_dsp_xmls as Record<string, string> | null;
      return xmls?.[selectedItemId] ?? null;
    }

    // Local source
    if (!selectedTune) return null;
    if (selectedTarget === "full") return getTuneDspXml(selectedTune);
    if (selectedTarget === "assemblies") {
      return getAssemblyDspXml(selectedTune, selectedItemId);
    }
    return getNuggetDspXml(selectedTune, selectedItemId);
  }, [
    selectedSource,
    tuneAssets,
    selectedTarget,
    selectedItemId,
    selectedTune,
  ]);

  const selectionLabel = useMemo(() => {
    if (!selectedTune) return "Select tune...";
    if (selectedTarget === "full") {
      return `${selectedTune} / full`;
    }
    if (!selectedItemId) {
      return `${selectedTune} / ${selectedTarget}`;
    }
    return `${selectedTune} / ${selectedTarget} / ${selectedItemId}`;
  }, [selectedItemId, selectedTarget, selectedTune]);

  // Selection handler
  const selectTune = useCallback(
    (source: TuneSource, tune: string, target: TargetType, itemId: string) => {
      setSelectedSource(source);
      setSelectedTune(tune);
      setSelectedTarget(target);
      setSelectedItemId(itemId);
    },
    [],
  );

  // Publish handler
  const handlePublish = useCallback(async () => {
    if (!selectedTune || selectedSource !== "local") return;

    setIsPublishing(true);
    try {
      const tuneAssets = bundleSingleTuneAssets(selectedTune);
      if (!tuneAssets) {
        throw new Error("Failed to bundle tune assets");
      }

      const finalTuneKey =
        publishMode === "create" ? selectedTune : publishMode;

      const { data, error } = await supabase.functions.invoke("tune-publish", {
        body: {
          tuneKey: selectedTune,
          title:
            publishMode === "create" ? newTuneTitle || selectedTune : undefined,
          tuneAssets,
          mode: publishMode === "create" ? "create" : "update",
          existingTuneKey: publishMode !== "create" ? publishMode : undefined,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Published successfully",
          description: `Tune "${finalTuneKey}" published.`,
        });
        setShowPublishDialog(false);
        setNewTuneTitle("");
        setPublishMode("create");

        // Invalidate queries to refresh published list
        queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
        queryClient.invalidateQueries({ queryKey: ["tune-assets"] });

        // Switch to viewing the published tune
        setSelectedSource("published");
        setSelectedTune(finalTuneKey);
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error) {
      console.error("[LabMode] Publish failed:", error);
      toast({
        title: "Publish failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  }, [
    selectedTune,
    selectedSource,
    publishMode,
    newTuneTitle,
    toast,
    queryClient,
  ]);

  // Cursor and playback refs
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const osmdDspRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorInitializedRef = useRef(false);
  const expectedGroupIndexRef = useRef(0);
  const remainingPitchCountsRef = useRef<Map<number, number>>(new Map());
  const wasPlayingRef = useRef(false);
  const cursorTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cursorEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initCursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const osmdViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const osmdDspViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const initStyleAppliedRef = useRef(false);

  const expectedGroups = useMemo(() => {
    if (!labSequence.notes.length) return [];
    const grouped = new Map<number, { startTime: number; pitches: number[] }>();
    labSequence.notes.forEach((note) => {
      const key = Math.round(note.startTime * 1000);
      const existing = grouped.get(key);
      if (existing) {
        existing.pitches.push(note.pitch);
        existing.startTime = Math.min(existing.startTime, note.startTime);
      } else {
        grouped.set(key, { startTime: note.startTime, pitches: [note.pitch] });
      }
    });
    return Array.from(grouped.values()).sort(
      (a, b) => a.startTime - b.startTime,
    );
  }, [labSequence.notes]);

  const buildPitchCounts = useCallback((pitches: number[]) => {
    const counts = new Map<number, number>();
    pitches.forEach((pitch) => {
      counts.set(pitch, (counts.get(pitch) ?? 0) + 1);
    });
    return counts;
  }, []);

  const resetExpectedTracking = useCallback(() => {
    expectedGroupIndexRef.current = 0;
    remainingPitchCountsRef.current = buildPitchCounts(
      expectedGroups[0]?.pitches ?? [],
    );
  }, [buildPitchCounts, expectedGroups]);

  const setCursorColorForGroup = useCallback(
    (groupIndex: number) => {
      const pitches = expectedGroups[groupIndex]?.pitches;
      if (!pitches?.length) return;
      const noteName = midiToNoteName(pitches[0]);
      const noteColor = getNoteColorForNoteName(noteName);
      if (noteColor) {
        osmdDspViewRef.current?.setCursorColor(noteColor);
      }
    },
    [expectedGroups],
  );

  const resetCursor = useCallback(() => {
    const osmd = osmdDspRef.current;
    if (osmd?.cursor) {
      osmd.cursor.reset();
      osmd.cursor.hide();
    }
    cursorInitializedRef.current = false;
  }, []);

  const clearCursorTimers = useCallback(() => {
    cursorTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    cursorTimeoutsRef.current = [];
    if (cursorEndTimeoutRef.current) {
      clearTimeout(cursorEndTimeoutRef.current);
      cursorEndTimeoutRef.current = null;
    }
    if (initCursorTimeoutRef.current) {
      clearTimeout(initCursorTimeoutRef.current);
      initCursorTimeoutRef.current = null;
    }
  }, []);

  const showCursorAtStart = useCallback(() => {
    const osmd = osmdDspRef.current;
    if (osmd?.cursor) {
      osmd.cursor.reset();
      osmd.cursor.show();
      osmd.cursor.update();
    }
    cursorInitializedRef.current = true;
    setCursorColorForGroup(0);
  }, [setCursorColorForGroup]);

  const ensureCursorInitialized = useCallback(() => {
    if (!cursorInitializedRef.current) {
      const osmd = osmdDspRef.current;
      if (osmd?.cursor) {
        osmd.cursor.reset();
        osmd.cursor.show();
        osmd.cursor.update();
      }
      cursorInitializedRef.current = true;
    }
  }, []);

  const advanceCursorToNextPlayableNote = useCallback(() => {
    const cursor = osmdDspRef.current?.cursor;
    if (!cursor) return;
    const getNotesUnderCursor = cursor.NotesUnderCursor?.bind(cursor);
    if (!getNotesUnderCursor) {
      cursor.next();
      cursor.update();
      return;
    }
    let steps = 0;
    const maxSteps = 128;
    do {
      cursor.next();
      steps += 1;
      if (cursor.iterator?.EndReached) break;
      const notes = getNotesUnderCursor() ?? [];
      const hasPlayableNote = notes.some((note) => {
        const typedNote = note as {
          isRest?: boolean | (() => boolean);
          IsCueNote?: boolean;
          IsGraceNote?: boolean;
          isCueNote?: boolean;
          isGraceNote?: boolean;
        };
        const isRest =
          typeof typedNote.isRest === "function"
            ? typedNote.isRest()
            : typedNote.isRest;
        const isCue = typedNote.IsCueNote ?? typedNote.isCueNote;
        const isGrace = typedNote.IsGraceNote ?? typedNote.isGraceNote;
        return !isRest && !isCue && !isGrace;
      });
      if (hasPlayableNote) break;
    } while (steps < maxSteps);
    cursor.update();
  }, []);

  const scheduleCursorPlayback = useCallback(() => {
    const osmd = osmdDspRef.current;
    if (!osmd?.cursor || labSequence.notes.length === 0) return;

    clearCursorTimers();
    resetExpectedTracking();
    showCursorAtStart();

    const minStartTime = Math.min(
      ...labSequence.notes.map((note) => note.startTime),
    );
    const normalizedNotes = labSequence.notes.map((note) => ({
      ...note,
      startTime: note.startTime - minStartTime,
      endTime: note.endTime - minStartTime,
    }));
    const normalizedTotalTime =
      labSequence.totalTime > 0
        ? labSequence.totalTime - minStartTime
        : Math.max(...normalizedNotes.map((note) => note.endTime), 0);

    const startTimes = Array.from(
      new Set(normalizedNotes.map((note) => note.startTime)),
    ).sort((a, b) => a - b);

    startTimes.slice(1).forEach((startTime, index) => {
      const targetIndex = index + 1;
      const timeout = setTimeout(() => {
        const cursor = osmdRef.current?.cursor;
        if (!cursor) return;
        if (expectedGroupIndexRef.current >= targetIndex) return;
        expectedGroupIndexRef.current = targetIndex;
        remainingPitchCountsRef.current = buildPitchCounts(
          expectedGroups[targetIndex]?.pitches ?? [],
        );
        setCursorColorForGroup(targetIndex);
        advanceCursorToNextPlayableNote();
      }, startTime * 1000);
      cursorTimeoutsRef.current.push(timeout);
    });

    cursorEndTimeoutRef.current = setTimeout(() => {
      showCursorAtStart();
      resetExpectedTracking();
    }, normalizedTotalTime * 1000);
  }, [
    advanceCursorToNextPlayableNote,
    buildPitchCounts,
    clearCursorTimers,
    expectedGroups,
    labSequence,
    resetExpectedTracking,
    setCursorColorForGroup,
    showCursorAtStart,
  ]);

  const handleUserNote = useCallback(
    (noteKey: string) => {
      const osmd = osmdDspRef.current;
      if (!osmd?.cursor || expectedGroups.length === 0) return;

      const pitch = noteNameToMidi(noteKey);
      const remaining = remainingPitchCountsRef.current;
      const remainingCount = remaining.get(pitch);
      if (!remainingCount) return;

      ensureCursorInitialized();
      if (remainingCount === 1) {
        remaining.delete(pitch);
      } else {
        remaining.set(pitch, remainingCount - 1);
      }

      if (remaining.size > 0) return;

      const nextIndex = expectedGroupIndexRef.current + 1;
      if (nextIndex >= expectedGroups.length) {
        resetCursor();
        resetExpectedTracking();
        return;
      }

      expectedGroupIndexRef.current = nextIndex;
      remainingPitchCountsRef.current = buildPitchCounts(
        expectedGroups[nextIndex].pitches,
      );
      setCursorColorForGroup(nextIndex);
      advanceCursorToNextPlayableNote();
    },
    [
      advanceCursorToNextPlayableNote,
      buildPitchCounts,
      ensureCursorInitialized,
      expectedGroups,
      resetCursor,
      resetExpectedTracking,
      setCursorColorForGroup,
    ],
  );

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      onStopPlayback?.();
      clearCursorTimers();
      showCursorAtStart();
      resetExpectedTracking();
      return;
    }

    if (!onPlaySequence || labSequence.notes.length === 0) return;
    scheduleCursorPlayback();
    onPlaySequence(labSequence);
  }, [
    clearCursorTimers,
    isPlaying,
    labSequence,
    onPlaySequence,
    onStopPlayback,
    resetExpectedTracking,
    scheduleCursorPlayback,
    showCursorAtStart,
  ]);

  const handleOsmdReady = useCallback((osmd: OpenSheetMusicDisplay) => {
    osmdRef.current = osmd;
    if (osmd.cursor) {
      osmd.cursor.hide();
    }
  }, []);

  const handleOsmdDspReady = useCallback(
    (osmd: OpenSheetMusicDisplay) => {
      osmdDspRef.current = osmd;
      resetExpectedTracking();
      initStyleAppliedRef.current = false;
      if (initCursorTimeoutRef.current) {
        clearTimeout(initCursorTimeoutRef.current);
      }
      initCursorTimeoutRef.current = setTimeout(() => {
        showCursorAtStart();
        setCursorColorForGroup(0);
        initCursorTimeoutRef.current = null;
      }, 300);
    },
    [resetExpectedTracking, setCursorColorForGroup, showCursorAtStart],
  );

  const handleCursorElementReadyDsp = useCallback(
    (cursorElement: HTMLImageElement | null) => {
      if (!cursorElement) {
        initStyleAppliedRef.current = false;
        return;
      }
      if (initStyleAppliedRef.current) return;
      if (initCursorTimeoutRef.current) {
        clearTimeout(initCursorTimeoutRef.current);
      }
      initCursorTimeoutRef.current = setTimeout(() => {
        showCursorAtStart();
        setCursorColorForGroup(0);
        initStyleAppliedRef.current = true;
        initCursorTimeoutRef.current = null;
      }, 300);
    },
    [setCursorColorForGroup, showCursorAtStart],
  );

  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      clearCursorTimers();
      showCursorAtStart();
      resetExpectedTracking();
    }
    wasPlayingRef.current = isPlaying;
  }, [clearCursorTimers, isPlaying, resetExpectedTracking, showCursorAtStart]);

  useEffect(() => {
    resetExpectedTracking();
  }, [resetExpectedTracking]);

  useEffect(() => {
    onRegisterNoteHandler?.(handleUserNote);
    return () => {
      onRegisterNoteHandler?.(null);
    };
  }, [handleUserNote, onRegisterNoteHandler]);

  useEffect(() => {
    return () => {
      clearCursorTimers();
    };
  }, [clearCursorTimers]);

  useEffect(() => {
    clearCursorTimers();
    resetExpectedTracking();
    if (osmdDspRef.current?.cursor) {
      showCursorAtStart();
    }
  }, [
    clearCursorTimers,
    resetExpectedTracking,
    showCursorAtStart,
    selectedItemId,
    selectedTarget,
    selectedTune,
  ]);

  // Loading state
  if (isLoadingList) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading tunes...</p>
      </div>
    );
  }

  // Empty state - no tunes at all
  if (publishedTuneKeys.size === 0 && unpublishedTuneKeys.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">
          No tunes found. Add tunes to src/music/ to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full max-w-3xl mx-auto flex flex-col flex-1 items-center justify-center">
      <div className="w-full flex flex-wrap justify-end gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePlayToggle}
          disabled={
            !labSequence.notes.length ||
            (selectedSource === "published" && isLoadingAssets)
          }
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4 mr-2" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Play
            </>
          )}
        </Button>

        {/* Publish button - only for local tunes */}
        {selectedSource === "local" && selectedTune && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowPublishDialog(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Publish
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedSource === "published" && isLoadingAssets}
            >
              {selectedSource === "published" && isLoadingAssets
                ? "Loading..."
                : selectionLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-popover">
            {/* Published tunes section */}
            {publishedTuneKeys.size > 0 && (
              <>
                <DropdownMenuLabel>Published</DropdownMenuLabel>
                {Array.from(publishedTuneKeys).map((tune) => {
                  const tuneNuggets = getNuggetIdsForTune(tune, "published");
                  const tuneAssemblies = getAssemblyIdsForTune(
                    tune,
                    "published",
                  );
                  return (
                    <DropdownMenuSub key={`published-${tune}`}>
                      <DropdownMenuSubTrigger>{tune}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="bg-popover">
                        <DropdownMenuItem
                          onClick={() =>
                            selectTune("published", tune, "full", "")
                          }
                        >
                          Full
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            Nuggets
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-popover">
                            {tuneNuggets.length ? (
                              tuneNuggets.map((id) => (
                                <DropdownMenuItem
                                  key={id}
                                  onClick={() =>
                                    selectTune("published", tune, "nuggets", id)
                                  }
                                >
                                  {id}
                                </DropdownMenuItem>
                              ))
                            ) : (
                              <DropdownMenuItem disabled>
                                No nuggets
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            Assemblies
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-popover">
                            {tuneAssemblies.length ? (
                              tuneAssemblies.map((id) => (
                                <DropdownMenuItem
                                  key={id}
                                  onClick={() =>
                                    selectTune(
                                      "published",
                                      tune,
                                      "assemblies",
                                      id,
                                    )
                                  }
                                >
                                  {id}
                                </DropdownMenuItem>
                              ))
                            ) : (
                              <DropdownMenuItem disabled>
                                No assemblies
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })}
              </>
            )}

            {/* Separator between sections */}
            {publishedTuneKeys.size > 0 && unpublishedTuneKeys.length > 0 && (
              <DropdownMenuSeparator />
            )}

            {/* Unpublished tunes section */}
            {unpublishedTuneKeys.length > 0 && (
              <>
                <DropdownMenuLabel>Un-Published</DropdownMenuLabel>
                {unpublishedTuneKeys.map((tune) => {
                  const tuneNuggets = getNuggetIdsForTune(tune, "local");
                  const tuneAssemblies = getAssemblyIdsForTune(tune, "local");
                  return (
                    <DropdownMenuSub key={`local-${tune}`}>
                      <DropdownMenuSubTrigger>{tune}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="bg-popover">
                        <DropdownMenuItem
                          onClick={() => selectTune("local", tune, "full", "")}
                        >
                          Full
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            Nuggets
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-popover">
                            {tuneNuggets.length ? (
                              tuneNuggets.map((id) => (
                                <DropdownMenuItem
                                  key={id}
                                  onClick={() =>
                                    selectTune("local", tune, "nuggets", id)
                                  }
                                >
                                  {id}
                                </DropdownMenuItem>
                              ))
                            ) : (
                              <DropdownMenuItem disabled>
                                No nuggets
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            Assemblies
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-popover">
                            {tuneAssemblies.length ? (
                              tuneAssemblies.map((id) => (
                                <DropdownMenuItem
                                  key={id}
                                  onClick={() =>
                                    selectTune("local", tune, "assemblies", id)
                                  }
                                >
                                  {id}
                                </DropdownMenuItem>
                              ))
                            ) : (
                              <DropdownMenuItem disabled>
                                No assemblies
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sheet music displays */}
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Full xml
          </div>
          {xmlFull ? (
            <OpenSheetMusicDisplayView
              ref={osmdViewRef}
              xml={xmlFull}
              compactness="compacttight"
              hasColor
              className="relative w-full"
              onOsmdReady={handleOsmdReady}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground border rounded">
              {selectedSource === "published" && isLoadingAssets
                ? "Loading XML..."
                : "No XML available"}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Simplified xml
          </div>
          {xmlDsp ? (
            <OpenSheetMusicDisplayView
              ref={osmdDspViewRef}
              xml={xmlDsp}
              compactness="compacttight"
              hasColor
              className="relative w-full"
              onOsmdReady={handleOsmdDspReady}
              onCursorElementReady={handleCursorElementReadyDsp}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground border rounded">
              {selectedSource === "published" && isLoadingAssets
                ? "Loading DSP XML..."
                : "No DSP XML available"}
            </div>
          )}
        </div>
      </div>

      {/* Publish Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Tune</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Publishing: <strong>{selectedTune}</strong>
            </p>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={publishMode} onValueChange={setPublishMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create New Tune</SelectItem>
                  {Array.from(publishedTuneKeys).map((key) => (
                    <SelectItem key={key} value={key}>
                      Update "{key}"
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {publishMode === "create" && (
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={newTuneTitle}
                  onChange={(e) => setNewTuneTitle(e.target.value)}
                  placeholder={`e.g., ${selectedTune}`}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPublishDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
