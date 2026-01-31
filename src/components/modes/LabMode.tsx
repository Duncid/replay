import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNoteColorForNoteName } from "@/constants/noteColors";
import { useTuneAssets, usePublishedTuneKeys } from "@/hooks/useTuneQueries";
import type { NoteSequence } from "@/types/noteSequence";
import type { TuneAssembly, TuneBriefing, TuneNugget } from "@/types/tuneAssets";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import { Pause, Play } from "lucide-react";
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

export const LabMode = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onRegisterNoteHandler,
}: LabModeProps) => {
  const targetOptions = ["full", "nuggets", "assemblies"] as const;

  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedTarget, setSelectedTarget] =
    useState<(typeof targetOptions)[number]>("assemblies");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  // Fetch published tune keys from database
  const { data: tuneList, isLoading: isLoadingList } = usePublishedTuneKeys();
  const tuneOptions = useMemo(
    () => tuneList?.map((t) => t.tune_key) ?? [],
    [tuneList]
  );

  // Auto-select first tune when list loads
  useEffect(() => {
    if (tuneOptions.length > 0 && !selectedTune) {
      setSelectedTune(tuneOptions[0]);
    }
  }, [tuneOptions, selectedTune]);

  // Fetch tune assets from database
  const { data: tuneAssets, isLoading: isLoadingAssets } = useTuneAssets(
    selectedTune || null
  );

  // Derive nugget/assembly IDs from database briefing
  const nuggetIds = useMemo(() => {
    const briefing = tuneAssets?.briefing as TuneBriefing | null;
    return briefing?.teachingOrder ?? [];
  }, [tuneAssets]);

  const assemblyIds = useMemo(() => {
    const briefing = tuneAssets?.briefing as TuneBriefing | null;
    return briefing?.assemblyOrder ?? [];
  }, [tuneAssets]);

  // Get nugget/assembly IDs for a specific tune from the list
  const getNuggetIdsForTune = useCallback(
    (tuneKey: string) => {
      const tuneInfo = tuneList?.find((t) => t.tune_key === tuneKey);
      return tuneInfo?.briefing?.teachingOrder ?? [];
    },
    [tuneList]
  );

  const getAssemblyIdsForTune = useCallback(
    (tuneKey: string) => {
      const tuneInfo = tuneList?.find((t) => t.tune_key === tuneKey);
      return tuneInfo?.briefing?.assemblyOrder ?? [];
    },
    [tuneList]
  );

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
  }, [assemblyIds, nuggetIds, selectedItemId, selectedTarget]);

  // Derive sequences from database
  const labSequence = useMemo(() => {
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
  }, [tuneAssets, selectedTarget, selectedItemId]);

  // Derive full XMLs from database
  const xmlFull = useMemo(() => {
    if (!tuneAssets) return null;
    if (selectedTarget === "full") return tuneAssets.tune_xml;
    if (selectedTarget === "assemblies") {
      const xmls = tuneAssets.assembly_xmls as Record<string, string> | null;
      return xmls?.[selectedItemId] ?? null;
    }
    const xmls = tuneAssets.nugget_xmls as Record<string, string> | null;
    return xmls?.[selectedItemId] ?? null;
  }, [tuneAssets, selectedTarget, selectedItemId]);

  // Derive DSP XMLs from database
  const xmlDsp = useMemo(() => {
    if (!tuneAssets) return null;
    if (selectedTarget === "full") return tuneAssets.tune_dsp_xml;
    if (selectedTarget === "assemblies") {
      const xmls = tuneAssets.assembly_dsp_xmls as Record<string, string> | null;
      return xmls?.[selectedItemId] ?? null;
    }
    const xmls = tuneAssets.nugget_dsp_xmls as Record<string, string> | null;
    return xmls?.[selectedItemId] ?? null;
  }, [tuneAssets, selectedTarget, selectedItemId]);

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
      (a, b) => a.startTime - b.startTime
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
      expectedGroups[0]?.pitches ?? []
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
    [expectedGroups]
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
      ...labSequence.notes.map((note) => note.startTime)
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
      new Set(normalizedNotes.map((note) => note.startTime))
    ).sort((a, b) => a - b);

    startTimes.slice(1).forEach((startTime, index) => {
      const targetIndex = index + 1;
      const timeout = setTimeout(() => {
        const cursor = osmdRef.current?.cursor;
        if (!cursor) return;
        if (expectedGroupIndexRef.current >= targetIndex) return;
        expectedGroupIndexRef.current = targetIndex;
        remainingPitchCountsRef.current = buildPitchCounts(
          expectedGroups[targetIndex]?.pitches ?? []
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
        expectedGroups[nextIndex].pitches
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
    ]
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
    [resetExpectedTracking, setCursorColorForGroup, showCursorAtStart]
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
    [setCursorColorForGroup, showCursorAtStart]
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
        <p className="text-muted-foreground">Loading published tunes...</p>
      </div>
    );
  }

  // Empty state - no published tunes
  if (!tuneOptions.length) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">
          No published tunes found. Publish a curriculum in Quest mode first.
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
          disabled={!labSequence.notes.length || isLoadingAssets}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isLoadingAssets}>
              {isLoadingAssets ? "Loading..." : selectionLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-popover">
            {tuneOptions.map((tune) => {
              const tuneNuggets = getNuggetIdsForTune(tune);
              const tuneAssemblies = getAssemblyIdsForTune(tune);
              return (
                <DropdownMenuSub key={tune}>
                  <DropdownMenuSubTrigger>{tune}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-popover">
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedTune(tune);
                        setSelectedTarget("full");
                        setSelectedItemId("");
                      }}
                    >
                      Full
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Nugget</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="bg-popover">
                        {tuneNuggets.length ? (
                          tuneNuggets.map((id) => (
                            <DropdownMenuItem
                              key={id}
                              onClick={() => {
                                setSelectedTune(tune);
                                setSelectedTarget("nuggets");
                                setSelectedItemId(id);
                              }}
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
                      <DropdownMenuSubTrigger>Assemble</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="bg-popover">
                        {tuneAssemblies.length ? (
                          tuneAssemblies.map((id) => (
                            <DropdownMenuItem
                              key={id}
                              onClick={() => {
                                setSelectedTune(tune);
                                setSelectedTarget("assemblies");
                                setSelectedItemId(id);
                              }}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
              {isLoadingAssets ? "Loading XML..." : "No XML available"}
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
              {isLoadingAssets ? "Loading DSP XML..." : "No DSP XML available"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
