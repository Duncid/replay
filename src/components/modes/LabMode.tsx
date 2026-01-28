import { Button } from "@/components/ui/button";
import labSequenceSource from "@/music/intro/output/tune.ns.json";
import type { NoteSequence } from "@/types/noteSequence";
import { noteNameToMidi } from "@/utils/noteSequenceUtils";
import { getTuneXml } from "@/utils/tuneAssetGlobs";
import { Pause, Play } from "lucide-react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { OpenSheetMusicDisplayView } from "../OpenSheetMusicDisplayView";

interface LabModeProps {
  onPlaySequence?: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  isPlaying?: boolean;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
}

export const LabMode = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onRegisterNoteHandler,
}: LabModeProps) => {
  const labSequence = labSequenceSource as NoteSequence;
  const xml = getTuneXml("intro");
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorInitializedRef = useRef(false);
  const expectedGroupIndexRef = useRef(0);
  const remainingPitchCountsRef = useRef<Map<number, number>>(new Map());
  const wasPlayingRef = useRef(false);

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

  const resetCursor = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor) return;
    osmd.cursor.reset();
    osmd.cursor.hide();
    cursorInitializedRef.current = false;
  }, []);

  const showCursorAtStart = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor) return;
    osmd.cursor.reset();
    osmd.cursor.show();
    osmd.cursor.update();
    cursorInitializedRef.current = true;
  }, []);

  const ensureCursorInitialized = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor) return;
    if (!cursorInitializedRef.current) {
      osmd.cursor.reset();
      osmd.cursor.show();
      osmd.cursor.update();
      cursorInitializedRef.current = true;
    }
  }, []);

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
      osmd.cursor.next();
      osmd.cursor.update();
    },
    [
      buildPitchCounts,
      ensureCursorInitialized,
      expectedGroups,
      resetCursor,
      resetExpectedTracking,
    ],
  );

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      onStopPlayback?.();
      resetCursor();
      resetExpectedTracking();
      return;
    }

    if (!onPlaySequence || labSequence.notes.length === 0) return;
    onPlaySequence(labSequence);
  }, [
    isPlaying,
    labSequence,
    onPlaySequence,
    onStopPlayback,
    resetCursor,
    resetExpectedTracking,
  ]);

  const handleOsmdReady = useCallback(
    (osmd: OpenSheetMusicDisplay) => {
      osmdRef.current = osmd;
      resetExpectedTracking();
      showCursorAtStart();
    },
    [resetExpectedTracking, showCursorAtStart],
  );

  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      resetCursor();
      resetExpectedTracking();
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, resetCursor, resetExpectedTracking]);

  useEffect(() => {
    resetExpectedTracking();
  }, [resetExpectedTracking]);

  useEffect(() => {
    onRegisterNoteHandler?.(handleUserNote);
    return () => {
      onRegisterNoteHandler?.(null);
    };
  }, [handleUserNote, onRegisterNoteHandler]);

  return (
    <div className="w-full max-w-3xl mx-auto">
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
      </div>
      <OpenSheetMusicDisplayView
        xml={xml}
        compactness="compacttight"
        hasColor
        className="relative w-full"
        onOsmdReady={handleOsmdReady}
      />
    </div>
  );
};
