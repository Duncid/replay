import { Button } from "@/components/ui/button";
import { getNoteColorForNoteName } from "@/constants/noteColors";
import stLouisBluesFullSequence from "@/music/st-louis-blues/output/tune.ns.json";
import stLouisBluesTeacher from "@/music/st-louis-blues/teacher.json";
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

const assemblyNsModules = import.meta.glob<{ default: NoteSequence }>(
  "/src/music/st-louis-blues/output/assemblies/*.ns.json",
  { eager: true },
);
const assemblyXmlModules = import.meta.glob<string>(
  "/src/music/st-louis-blues/output/assemblies/*.xml",
  { eager: true, query: "?raw", import: "default" },
);
const assemblyDspXmlModules = import.meta.glob<string>(
  "/src/music/st-louis-blues/output/assemblies/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" },
);
const assemblyDsp2XmlModules = import.meta.glob<string>(
  "/src/music/st-louis-blues/output/assemblies/*.dsp2.xml",
  { eager: true, query: "?raw", import: "default" },
);

const getAssemblyNs = (assemblyId: string) =>
  assemblyNsModules[
    `/src/music/st-louis-blues/output/assemblies/${assemblyId}.ns.json`
  ]?.default ?? null;

const getAssemblyXml = (assemblyId: string) =>
  assemblyXmlModules[
    `/src/music/st-louis-blues/output/assemblies/${assemblyId}.xml`
  ] ?? null;
const getAssemblyDspXml = (assemblyId: string) =>
  assemblyDspXmlModules[
    `/src/music/st-louis-blues/output/assemblies/${assemblyId}.dsp.xml`
  ] ?? null;
const getAssemblyDsp2Xml = (assemblyId: string) =>
  assemblyDsp2XmlModules[
    `/src/music/st-louis-blues/output/assemblies/${assemblyId}.dsp2.xml`
  ] ?? null;

export const LabMode = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onRegisterNoteHandler,
}: LabModeProps) => {
  const assemblyOrder =
    (stLouisBluesTeacher as { assemblyOrder?: string[] }).assemblyOrder ?? [];
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<string>(
    assemblyOrder[0] ?? "A1",
  );
  const labSequence = useMemo(
    () =>
      getAssemblyNs(selectedAssemblyId) ??
      (stLouisBluesFullSequence as NoteSequence),
    [selectedAssemblyId],
  );
  const xmlFull = useMemo(
    () => getAssemblyXml(selectedAssemblyId),
    [selectedAssemblyId],
  );
  const xmlDsp = useMemo(
    () => getAssemblyDspXml(selectedAssemblyId),
    [selectedAssemblyId],
  );
  const xmlDsp2 = useMemo(
    () => getAssemblyDsp2Xml(selectedAssemblyId),
    [selectedAssemblyId],
  );
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const osmdDspRef = useRef<OpenSheetMusicDisplay | null>(null);
  const osmdDsp2Ref = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorInitializedRef = useRef(false);
  const expectedGroupIndexRef = useRef(0);
  const remainingPitchCountsRef = useRef<Map<number, number>>(new Map());
  const wasPlayingRef = useRef(false);
  const cursorTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cursorEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initCursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const osmdViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const osmdDspViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const osmdDsp2ViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
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
        osmdViewRef.current?.setCursorColor(noteColor);
        osmdDspViewRef.current?.setCursorColor(noteColor);
        osmdDsp2ViewRef.current?.setCursorColor(noteColor);
      }
    },
    [expectedGroups],
  );

  const resetCursor = useCallback(() => {
    [osmdRef, osmdDspRef, osmdDsp2Ref].forEach((ref) => {
      const osmd = ref.current;
      if (!osmd?.cursor) return;
      osmd.cursor.reset();
      osmd.cursor.hide();
    });
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
    [osmdRef, osmdDspRef, osmdDsp2Ref].forEach((ref) => {
      const osmd = ref.current;
      if (!osmd?.cursor) return;
      osmd.cursor.reset();
      osmd.cursor.show();
      osmd.cursor.update();
    });
    cursorInitializedRef.current = true;
    setCursorColorForGroup(0);
  }, [setCursorColorForGroup]);

  const ensureCursorInitialized = useCallback(() => {
    if (!cursorInitializedRef.current) {
      [osmdRef, osmdDspRef, osmdDsp2Ref].forEach((ref) => {
        const osmd = ref.current;
        if (!osmd?.cursor) return;
        osmd.cursor.reset();
        osmd.cursor.show();
        osmd.cursor.update();
      });
      cursorInitializedRef.current = true;
    }
  }, []);

  const advanceCursorToNextPlayableNote = useCallback(() => {
    const cursorTargets = [osmdRef, osmdDspRef, osmdDsp2Ref]
      .map((ref) => ref.current?.cursor)
      .filter(Boolean) as Array<{
      next: () => void;
      update: () => void;
      NotesUnderCursor?: () => unknown[];
      iterator?: { EndReached?: boolean };
    }>;
    if (cursorTargets.length === 0) return;

    cursorTargets.forEach((cursor) => {
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
    });
  }, []);

  const scheduleCursorPlayback = useCallback(() => {
    const osmd = osmdRef.current;
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
      const osmd = osmdRef.current;
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

  const handleOsmdReady = useCallback(
    (osmd: OpenSheetMusicDisplay) => {
      osmdRef.current = osmd;
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

  const handleOsmdDsp2Ready = useCallback(
    (osmd: OpenSheetMusicDisplay) => {
      osmdDsp2Ref.current = osmd;
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

  const handleCursorElementReady = useCallback(
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

  const handleCursorElementReadyDsp2 = useCallback(
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
    if (osmdRef.current?.cursor) {
      showCursorAtStart();
    }
  }, [
    clearCursorTimers,
    resetExpectedTracking,
    showCursorAtStart,
    selectedAssemblyId,
  ]);

  return (
    <div className="w-full h-full max-w-3xl mx-auto flex flex-col flex-1 items-center justify-center">
      <div className="w-full flex justify-end mb-3">
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
        <select
          className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={selectedAssemblyId}
          onChange={(event) => setSelectedAssemblyId(event.target.value)}
        >
          {assemblyOrder.map((assemblyId) => (
            <option key={assemblyId} value={assemblyId}>
              {assemblyId}
            </option>
          ))}
        </select>
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
            onCursorElementReady={handleCursorElementReady}
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Display from NS
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
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Display from Music21
          </div>
          <OpenSheetMusicDisplayView
            ref={osmdDsp2ViewRef}
            xml={xmlDsp2}
            compactness="compacttight"
            hasColor
            className="relative w-full"
            onOsmdReady={handleOsmdDsp2Ready}
            onCursorElementReady={handleCursorElementReadyDsp2}
          />
        </div>
      </div>
    </div>
  );
};
