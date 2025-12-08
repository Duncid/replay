import { useState, useCallback } from "react";
import { SheetMusic } from "@/components/SheetMusic";
import { NoteSequence, Note } from "@/types/noteSequence";
import { createEmptyNoteSequence, beatsToSeconds } from "@/utils/noteSequenceUtils";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
import { MergeSessionDialog } from "@/components/MergeSessionDialog";

interface ComposeEntry {
  userSequence: NoteSequence;
}

type GapUnit = "beats" | "measures";
type MergeDirection = "previous" | "next";

interface ComposeModeProps {
  bpm: number;
  timeSignature: string;
  onReplay: (sequence: NoteSequence) => void;
  onPlayAll: (combinedSequence: NoteSequence) => void;
  onStopPlayback: () => void;
  onClearHistory: () => void;
  liveNotes?: Note[];
  isRecording?: boolean;
  isPlayingAll?: boolean;
}

export function ComposeMode({ 
  bpm, 
  timeSignature, 
  onReplay, 
  onPlayAll,
  onStopPlayback,
  onClearHistory,
  liveNotes = [],
  isRecording = false,
  isPlayingAll = false,
}: ComposeModeProps) {
  const [history, setHistory] = useState<ComposeEntry[]>([]);

  const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);

  // Simply add as a new entry - no merging
  const addUserSequence = useCallback((userSequence: NoteSequence) => {
    setHistory((prev) => [...prev, { userSequence }]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  const startNewSession = useCallback(() => {
    setHistory((prev) => [...prev, { userSequence: createEmptyNoteSequence(bpm, timeSignature) }]);
  }, [bpm, timeSignature]);

  // Merge two sessions with a gap
  const mergeSessions = useCallback((
    sessionIndex: number,
    direction: MergeDirection,
    gapValue: number,
    gapUnit: GapUnit
  ) => {
    setHistory((prev) => {
      const targetIndex = direction === "previous" ? sessionIndex - 1 : sessionIndex;
      const sourceIndex = direction === "previous" ? sessionIndex : sessionIndex + 1;

      if (targetIndex < 0 || sourceIndex >= prev.length) return prev;

      const targetSession = prev[targetIndex];
      const sourceSession = prev[sourceIndex];

      // Calculate gap in seconds
      const gapInBeats = gapUnit === "measures" ? gapValue * beatsPerMeasure : gapValue;
      const gapSeconds = beatsToSeconds(gapInBeats, bpm);

      // Offset source notes
      const timeOffset = targetSession.userSequence.totalTime + gapSeconds;
      const offsetNotes = sourceSession.userSequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + timeOffset,
        endTime: note.endTime + timeOffset,
      }));

      const mergedSequence: NoteSequence = {
        ...targetSession.userSequence,
        notes: [...targetSession.userSequence.notes, ...offsetNotes],
        totalTime: timeOffset + sourceSession.userSequence.totalTime,
      };

      // Remove the source and replace target with merged
      const newHistory = [...prev];
      newHistory[targetIndex] = { userSequence: mergedSequence };
      newHistory.splice(sourceIndex, 1);
      
      return newHistory;
    });
  }, [bpm, beatsPerMeasure]);

  // Create combined sequence for playing all
  const handlePlayAll = useCallback(() => {
    if (history.length === 0) return;

    // One measure gap between sessions
    const measureGapSeconds = beatsToSeconds(beatsPerMeasure, bpm);

    let combinedNotes: Note[] = [];
    let currentTime = 0;

    history.forEach((entry, index) => {
      if (entry.userSequence.notes.length === 0) return;

      // Add notes with time offset
      const offsetNotes = entry.userSequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + currentTime,
        endTime: note.endTime + currentTime,
      }));
      combinedNotes = [...combinedNotes, ...offsetNotes];
      
      currentTime += entry.userSequence.totalTime;
      
      // Add measure gap if not last
      if (index < history.length - 1) {
        currentTime += measureGapSeconds;
      }
    });

    const combinedSequence: NoteSequence = {
      notes: combinedNotes,
      totalTime: currentTime,
      tempos: [{ time: 0, qpm: bpm }],
      timeSignatures: [{ time: 0, numerator: beatsPerMeasure, denominator: parseInt(timeSignature.split('/')[1]) }],
    };

    onPlayAll(combinedSequence);
  }, [history, bpm, beatsPerMeasure, timeSignature, onPlayAll]);

  // Create a live sequence from current notes for real-time display
  const liveSequence: NoteSequence | null = liveNotes.length > 0 ? {
    notes: liveNotes,
    totalTime: Math.max(...liveNotes.map(n => n.endTime), 0),
    tempos: [{ time: 0, qpm: bpm }],
    timeSignatures: [{ 
      time: 0, 
      numerator: beatsPerMeasure, 
      denominator: parseInt(timeSignature.split('/')[1]) 
    }],
  } : null;

  const hasValidSessions = history.some(entry => entry.userSequence.notes.length > 0);

  return {
    history,
    addUserSequence,
    clearHistory,
    startNewSession,
    renderHistory: () => (
      <>
        {/* Global Play/Stop button */}
        {hasValidSessions && (
          <div className="w-full flex justify-start mb-2">
            {isPlayingAll ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onStopPlayback}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayAll}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Play All
              </Button>
            )}
          </div>
        )}

        {/* Live recording display */}
        {isRecording && liveSequence && (
          <div className="w-full space-y-2 opacity-75">
            <SheetMusic
              sequence={liveSequence}
              isUserNotes={true}
              compact
              label="Recording..."
            />
          </div>
        )}
        
        {/* Completed recordings */}
        {history.length > 0 && (
          <div className="w-full space-y-2">
            {history.map((entry, index) => (
              entry.userSequence.notes.length > 0 && (
                <div key={index} className="relative group">
                  <SheetMusic
                    sequence={entry.userSequence}
                    isUserNotes={true}
                    onReplay={() => onReplay(entry.userSequence)}
                    compact
                  />
                  {/* Merge button overlay */}
                  <div className="absolute top-2 right-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MergeSessionDialog
                      sessionIndex={index}
                      totalSessions={history.filter(e => e.userSequence.notes.length > 0).length}
                      onMerge={(direction, gapValue, gapUnit) => 
                        mergeSessions(index, direction, gapValue, gapUnit)
                      }
                    />
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </>
    ),
  };
}
