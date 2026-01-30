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
import type { NoteSequence } from "@/types/noteSequence";
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

const teacherModules = import.meta.glob<{
  default: {
    nuggets?: Array<{ id: string }>;
    assemblies?: Array<{ id: string }>;
    assemblyOrder?: string[];
  };
}>("/src/music/*/teacher.json", { eager: true });

const tuneNsModules = import.meta.glob<{ default: NoteSequence }>(
  "/src/music/*/output/tune.ns.json",
  { eager: true },
);
const tuneXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.xml",
  { eager: true, query: "?raw", import: "default" },
);
const tuneDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/dsp.xml",
  { eager: true, query: "?raw", import: "default" },
);

const assemblyNsModules = import.meta.glob<{ default: NoteSequence }>(
  "/src/music/*/output/assemblies/*.ns.json",
  { eager: true },
);
const assemblyXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.xml",
  { eager: true, query: "?raw", import: "default" },
);
const assemblyDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" },
);

const nuggetNsModules = import.meta.glob<{ default: NoteSequence }>(
  "/src/music/*/output/nuggets/*.ns.json",
  { eager: true },
);
const nuggetXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.xml",
  { eager: true, query: "?raw", import: "default" },
);
const nuggetDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" },
);

const getTeacher = (musicRef: string) =>
  teacherModules[`/src/music/${musicRef}/teacher.json`]?.default ?? null;

const getTuneNs = (musicRef: string) =>
  tuneNsModules[`/src/music/${musicRef}/output/tune.ns.json`]?.default ?? null;
const getTuneXml = (musicRef: string) =>
  tuneXmlModules[`/src/music/${musicRef}/output/tune.xml`] ?? null;
const getTuneDspXml = (musicRef: string) =>
  tuneDspXmlModules[`/src/music/${musicRef}/output/dsp.xml`] ?? null;

const getAssemblyNs = (musicRef: string, assemblyId: string) =>
  assemblyNsModules[
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.ns.json`
  ]?.default ?? null;

const getAssemblyXml = (musicRef: string, assemblyId: string) =>
  assemblyXmlModules[
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.xml`
  ] ?? null;
const getAssemblyDspXml = (musicRef: string, assemblyId: string) =>
  assemblyDspXmlModules[
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.dsp.xml`
  ] ?? null;

const getNuggetNs = (musicRef: string, nuggetId: string) =>
  nuggetNsModules[`/src/music/${musicRef}/output/nuggets/${nuggetId}.ns.json`]
    ?.default ?? null;
const getNuggetXml = (musicRef: string, nuggetId: string) =>
  nuggetXmlModules[`/src/music/${musicRef}/output/nuggets/${nuggetId}.xml`] ??
  null;
const getNuggetDspXml = (musicRef: string, nuggetId: string) =>
  nuggetDspXmlModules[
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.dsp.xml`
  ] ?? null;

const EMPTY_SEQUENCE: NoteSequence = { notes: [], totalTime: 0 };

export const LabMode = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onRegisterNoteHandler,
}: LabModeProps) => {
  const tuneOptions = ["intro", "gymnopdie", "st-louis-blues"] as const;
  const targetOptions = ["full", "nuggets", "assemblies"] as const;

  const [selectedTune, setSelectedTune] =
    useState<(typeof tuneOptions)[number]>("st-louis-blues");
  const [selectedTarget, setSelectedTarget] =
    useState<(typeof targetOptions)[number]>("assemblies");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const teacher = useMemo(() => getTeacher(selectedTune), [selectedTune]);
  const assemblyIds = useMemo(() => {
    if (!teacher) return [];
    if (teacher.assemblyOrder?.length) return teacher.assemblyOrder;
    return teacher.assemblies?.map((assembly) => assembly.id) ?? [];
  }, [teacher]);
  const nuggetIds = useMemo(
    () => teacher?.nuggets?.map((nugget) => nugget.id) ?? [],
    [teacher],
  );

  const getNuggetIdsForTune = useCallback((musicRef: string) => {
    const tuneTeacher = getTeacher(musicRef);
    return tuneTeacher?.nuggets?.map((nugget) => nugget.id) ?? [];
  }, []);

  const getAssemblyIdsForTune = useCallback((musicRef: string) => {
    const tuneTeacher = getTeacher(musicRef);
    if (tuneTeacher?.assemblyOrder?.length) return tuneTeacher.assemblyOrder;
    return tuneTeacher?.assemblies?.map((assembly) => assembly.id) ?? [];
  }, []);

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

  const labSequence = useMemo(() => {
    if (selectedTarget === "full") {
      return getTuneNs(selectedTune) ?? EMPTY_SEQUENCE;
    }
    if (selectedTarget === "assemblies") {
      return getAssemblyNs(selectedTune, selectedItemId) ?? EMPTY_SEQUENCE;
    }
    return getNuggetNs(selectedTune, selectedItemId) ?? EMPTY_SEQUENCE;
  }, [selectedItemId, selectedTarget, selectedTune]);

  const xmlFull = useMemo(() => {
    if (selectedTarget === "full") {
      return getTuneXml(selectedTune);
    }
    if (selectedTarget === "assemblies") {
      return getAssemblyXml(selectedTune, selectedItemId);
    }
    return getNuggetXml(selectedTune, selectedItemId);
  }, [selectedItemId, selectedTarget, selectedTune]);

  const xmlDsp = useMemo(() => {
    if (selectedTarget === "full") {
      return getTuneDspXml(selectedTune);
    }
    if (selectedTarget === "assemblies") {
      return getAssemblyDspXml(selectedTune, selectedItemId);
    }
    return getNuggetDspXml(selectedTune, selectedItemId);
  }, [selectedItemId, selectedTarget, selectedTune]);

  const selectionLabel = useMemo(() => {
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

  return (
    <div className="w-full h-full max-w-3xl mx-auto flex flex-col flex-1 items-center justify-center">
      <div className="w-full flex flex-wrap justify-end gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePlayToggle}
          disabled={!labSequence.notes.length}
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
            <Button variant="outline" size="sm">
              {selectionLabel}
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
          <OpenSheetMusicDisplayView
            ref={osmdViewRef}
            xml={xmlFull}
            compactness="compacttight"
            hasColor
            className="relative w-full"
            onOsmdReady={handleOsmdReady}
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Simplified xml
          </div>
          <OpenSheetMusicDisplayView
            ref={osmdDspViewRef}
            xml={xmlDsp}
            compactness="compacttight"
            hasColor
            className="relative w-full"
            onOsmdReady={handleOsmdDspReady}
            onCursorElementReady={handleCursorElementReadyDsp}
          />
        </div>
      </div>
    </div>
  );
};
