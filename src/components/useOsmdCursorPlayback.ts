import { getNoteColorForNoteName } from "@/constants/noteColors";
import type { OpenSheetMusicDisplayViewHandle } from "@/components/OpenSheetMusicDisplayView";
import type { NoteSequence } from "@/types/noteSequence";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useCallback, useEffect, useMemo, useRef } from "react";

type OsmdCursorGroup = { startTime: number; endTime: number; pitches: number[] };

interface UseOsmdCursorPlaybackOptions {
  sequence: NoteSequence;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (handler: ((noteKey: string) => void) | null) => void;
  isPlaying?: boolean;
  autoScheduleOnPlay?: boolean;
  resetKey?: string | number | null;
}

export function useOsmdCursorPlayback({
  sequence,
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
  isPlaying = false,
  autoScheduleOnPlay = false,
  resetKey,
}: UseOsmdCursorPlaybackOptions) {
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const osmdViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const cursorInitializedRef = useRef(false);
  const expectedGroupIndexRef = useRef(0);
  const remainingPressCountsRef = useRef<Map<number, number>>(new Map());
  const remainingReleaseCountsRef = useRef<Map<number, number>>(new Map());
  const cursorTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cursorEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initCursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const groupTokenRef = useRef(0);
  const groupStartedRef = useRef(false);
  const initStyleAppliedRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const hasScheduledRef = useRef(false);

  const expectedGroups = useMemo<OsmdCursorGroup[]>(() => {
    if (!sequence.notes.length) return [];
    const grouped = new Map<number, OsmdCursorGroup>();
    sequence.notes.forEach((note) => {
      const key = Math.round(note.startTime * 1000);
      const noteEndTime = note.endTime ?? note.startTime;
      const existing = grouped.get(key);
      if (existing) {
        existing.pitches.push(note.pitch);
        existing.startTime = Math.min(existing.startTime, note.startTime);
        existing.endTime = Math.max(existing.endTime, noteEndTime);
      } else {
        grouped.set(key, {
          startTime: note.startTime,
          endTime: noteEndTime,
          pitches: [note.pitch],
        });
      }
    });
    return Array.from(grouped.values()).sort(
      (a, b) => a.startTime - b.startTime,
    );
  }, [sequence.notes]);

  const buildPitchCounts = useCallback((pitches: number[]) => {
    const counts = new Map<number, number>();
    pitches.forEach((pitch) => {
      counts.set(pitch, (counts.get(pitch) ?? 0) + 1);
    });
    return counts;
  }, []);

  const setCursorColorForGroup = useCallback(
    (groupIndex: number) => {
      const pitches = expectedGroups[groupIndex]?.pitches;
      if (!pitches?.length) return;
      const noteName = midiToNoteName(pitches[0]);
      const noteColor = getNoteColorForNoteName(noteName);
      if (noteColor) {
        osmdViewRef.current?.setCursorColor(noteColor);
      }
    },
    [expectedGroups],
  );

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
    if (durationTimeoutRef.current) {
      clearTimeout(durationTimeoutRef.current);
      durationTimeoutRef.current = null;
    }
  }, []);

  const clearDurationTimer = useCallback(() => {
    if (durationTimeoutRef.current) {
      clearTimeout(durationTimeoutRef.current);
      durationTimeoutRef.current = null;
    }
  }, []);

  const resetExpectedTracking = useCallback(() => {
    expectedGroupIndexRef.current = 0;
    remainingPressCountsRef.current = buildPitchCounts(
      expectedGroups[0]?.pitches ?? [],
    );
    remainingReleaseCountsRef.current = new Map();
    groupStartedRef.current = false;
    clearDurationTimer();
  }, [buildPitchCounts, clearDurationTimer, expectedGroups]);

  const showCursorAtStart = useCallback(() => {
    const osmd = osmdRef.current;
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
      const osmd = osmdRef.current;
      if (osmd?.cursor) {
        osmd.cursor.reset();
        osmd.cursor.show();
        osmd.cursor.update();
      }
      cursorInitializedRef.current = true;
    }
  }, []);

  const advanceCursorToNextPlayableNote = useCallback(() => {
    const cursor = osmdRef.current?.cursor;
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
    const osmd = osmdRef.current;
    if (!osmd?.cursor || sequence.notes.length === 0) return;

    clearCursorTimers();
    resetExpectedTracking();
    showCursorAtStart();

    const minStartTime = Math.min(
      ...sequence.notes.map((note) => note.startTime),
    );
    const normalizedNotes = sequence.notes.map((note) => ({
      ...note,
      startTime: note.startTime - minStartTime,
      endTime: note.endTime - minStartTime,
    }));
    const normalizedTotalTime =
      sequence.totalTime > 0
        ? sequence.totalTime - minStartTime
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
        remainingPressCountsRef.current = buildPitchCounts(
          expectedGroups[targetIndex]?.pitches ?? [],
        );
        remainingReleaseCountsRef.current = new Map();
        groupStartedRef.current = false;
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
    resetExpectedTracking,
    sequence,
    setCursorColorForGroup,
    showCursorAtStart,
  ]);

  const handleUserNote = useCallback(
    (noteKey: string) => {
      const osmd = osmdRef.current;
      if (!osmd?.cursor || expectedGroups.length === 0) return;

      const pitch = noteNameToMidi(noteKey);
      const remaining = remainingPressCountsRef.current;
      const remainingCount = remaining.get(pitch);
      if (!remainingCount) return;

      ensureCursorInitialized();
      if (!groupStartedRef.current) {
        groupStartedRef.current = true;
        const token = groupTokenRef.current + 1;
        groupTokenRef.current = token;
        const currentGroup = expectedGroups[expectedGroupIndexRef.current];
        if (currentGroup) {
          const durationSeconds = Math.max(
            0,
            currentGroup.endTime - currentGroup.startTime,
          );
          clearDurationTimer();
          durationTimeoutRef.current = setTimeout(() => {
            if (groupTokenRef.current !== token) return;
            const nextIndex = expectedGroupIndexRef.current + 1;
            clearDurationTimer();
            if (nextIndex >= expectedGroups.length) {
              showCursorAtStart();
              resetExpectedTracking();
              return;
            }
            expectedGroupIndexRef.current = nextIndex;
            remainingPressCountsRef.current = buildPitchCounts(
              expectedGroups[nextIndex].pitches,
            );
            remainingReleaseCountsRef.current = new Map();
            groupStartedRef.current = false;
            setCursorColorForGroup(nextIndex);
            advanceCursorToNextPlayableNote();
          }, durationSeconds * 1000);
        }
      }
      if (remainingCount === 1) {
        remaining.delete(pitch);
      } else {
        remaining.set(pitch, remainingCount - 1);
      }

      if (remaining.size === 0 && remainingReleaseCountsRef.current.size === 0) {
        remainingReleaseCountsRef.current = buildPitchCounts(
          expectedGroups[expectedGroupIndexRef.current]?.pitches ?? [],
        );
      }
    },
    [
      advanceCursorToNextPlayableNote,
      buildPitchCounts,
      clearDurationTimer,
      ensureCursorInitialized,
      expectedGroups,
      resetExpectedTracking,
      setCursorColorForGroup,
      showCursorAtStart,
    ],
  );

  const handleUserNoteOff = useCallback(
    (noteKey: string) => {
      if (expectedGroups.length === 0) return;
      const remaining = remainingReleaseCountsRef.current;
      if (remaining.size === 0) return;
      const pitch = noteNameToMidi(noteKey);
      const remainingCount = remaining.get(pitch);
      if (!remainingCount) return;

      if (remainingCount === 1) {
        remaining.delete(pitch);
      } else {
        remaining.set(pitch, remainingCount - 1);
      }

      if (remaining.size > 0) return;

      const nextIndex = expectedGroupIndexRef.current + 1;
      clearDurationTimer();
      groupTokenRef.current += 1;
      if (nextIndex >= expectedGroups.length) {
        showCursorAtStart();
        resetExpectedTracking();
        return;
      }
      expectedGroupIndexRef.current = nextIndex;
      remainingPressCountsRef.current = buildPitchCounts(
        expectedGroups[nextIndex].pitches,
      );
      remainingReleaseCountsRef.current = new Map();
      groupStartedRef.current = false;
      setCursorColorForGroup(nextIndex);
      advanceCursorToNextPlayableNote();
    },
    [
      advanceCursorToNextPlayableNote,
      buildPitchCounts,
      clearDurationTimer,
      expectedGroups,
      resetExpectedTracking,
      setCursorColorForGroup,
      showCursorAtStart,
    ],
  );

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

  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      clearCursorTimers();
      showCursorAtStart();
      resetExpectedTracking();
      hasScheduledRef.current = false;
    }
    wasPlayingRef.current = isPlaying;
  }, [clearCursorTimers, isPlaying, resetExpectedTracking, showCursorAtStart]);

  useEffect(() => {
    resetExpectedTracking();
  }, [resetExpectedTracking]);

  useEffect(() => {
    if (autoScheduleOnPlay && isPlaying && !hasScheduledRef.current) {
      hasScheduledRef.current = true;
      scheduleCursorPlayback();
    }
  }, [autoScheduleOnPlay, isPlaying, scheduleCursorPlayback]);

  useEffect(() => {
    onRegisterNoteHandler?.(handleUserNote);
    return () => {
      onRegisterNoteHandler?.(null);
    };
  }, [handleUserNote, onRegisterNoteHandler]);

  useEffect(() => {
    onRegisterNoteOffHandler?.(handleUserNoteOff);
    return () => {
      onRegisterNoteOffHandler?.(null);
    };
  }, [handleUserNoteOff, onRegisterNoteOffHandler]);

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
  }, [clearCursorTimers, resetExpectedTracking, showCursorAtStart, resetKey]);

  return {
    osmdViewRef,
    handleOsmdReady,
    handleCursorElementReady,
    scheduleCursorPlayback,
    clearCursorTimers,
    showCursorAtStart,
    resetExpectedTracking,
  };
}
