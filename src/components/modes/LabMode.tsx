import { Button } from "@/components/ui/button";
import labSequenceSource from "@/music/intro/output/tune.ns.json";
import type { NoteSequence } from "@/types/noteSequence";
import { getTuneXml } from "@/utils/tuneAssetGlobs";
import { Pause, Play } from "lucide-react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useCallback, useEffect, useRef } from "react";
import { OpenSheetMusicDisplayView } from "../OpenSheetMusicDisplayView";

interface LabModeProps {
  onPlaySequence?: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  isPlaying?: boolean;
}

export const LabMode = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
}: LabModeProps) => {
  const labSequence = labSequenceSource as NoteSequence;
  const xml = getTuneXml("intro");
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cursorEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearCursorTimers = useCallback(() => {
    cursorTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    cursorTimeoutsRef.current = [];
    if (cursorEndTimeoutRef.current) {
      clearTimeout(cursorEndTimeoutRef.current);
      cursorEndTimeoutRef.current = null;
    }
  }, []);

  const resetCursor = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor) return;
    osmd.cursor.reset();
    osmd.cursor.hide();
  }, []);

  const scheduleCursor = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor || labSequence.notes.length === 0) return;

    osmd.cursor.show();
    osmd.cursor.reset();
    osmd.cursor.update();

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

    // Cursor starts at first note after reset; only advance on subsequent notes.
    startTimes.slice(1).forEach((startTime) => {
      const timeout = setTimeout(() => {
        const cursor = osmdRef.current?.cursor;
        if (!cursor) return;
        cursor.next();
        cursor.update();
      }, startTime * 1000);
      cursorTimeoutsRef.current.push(timeout);
    });

    cursorEndTimeoutRef.current = setTimeout(() => {
      resetCursor();
    }, normalizedTotalTime * 1000);
  }, [labSequence, resetCursor]);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      onStopPlayback?.();
      clearCursorTimers();
      resetCursor();
      return;
    }

    if (!onPlaySequence || labSequence.notes.length === 0) return;
    clearCursorTimers();
    scheduleCursor();
    onPlaySequence(labSequence);
  }, [
    clearCursorTimers,
    isPlaying,
    labSequence,
    onPlaySequence,
    onStopPlayback,
    resetCursor,
    scheduleCursor,
  ]);

  const handleOsmdReady = useCallback((osmd: OpenSheetMusicDisplay) => {
    osmdRef.current = osmd;
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      clearCursorTimers();
      resetCursor();
    }
  }, [clearCursorTimers, isPlaying, resetCursor]);

  useEffect(() => {
    return () => {
      clearCursorTimers();
    };
  }, [clearCursorTimers]);

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
