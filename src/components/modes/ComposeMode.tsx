import { useState, useCallback, useEffect } from "react";
import { NoteSequence, Note } from "@/types/noteSequence";
import { createEmptyNoteSequence, beatsToSeconds } from "@/utils/noteSequenceUtils";
import { MergeSessionDialog } from "@/components/MergeSessionDialog";
import { TrackItem } from "@/components/TrackItem";
import { TrackContainer } from "@/components/TrackContainer";

type GapUnit = "beats" | "measures";
type MergeDirection = "previous" | "next";

export interface ComposeEntry {
  userSequence: NoteSequence;
}

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
  initialHistory?: ComposeEntry[];
  onHistoryChange?: (history: ComposeEntry[]) => void;
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
  initialHistory = [],
  onHistoryChange,
}: ComposeModeProps) {
  const [history, setHistory] = useState<ComposeEntry[]>(initialHistory);

  const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);

  // Notify parent when history changes
  useEffect(() => {
    onHistoryChange?.(history);
  }, [history, onHistoryChange]);

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

  // Build combined sequence from all sessions
  const getCombinedSequence = useCallback((): NoteSequence | null => {
    if (history.length === 0) return null;

    // Half measure gap between sessions
    const measureGapSeconds = beatsToSeconds(beatsPerMeasure / 2, bpm);

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

    return {
      notes: combinedNotes,
      totalTime: currentTime,
      tempos: [{ time: 0, qpm: bpm }],
      timeSignatures: [{ time: 0, numerator: beatsPerMeasure, denominator: parseInt(timeSignature.split('/')[1]) }],
    };
  }, [history, bpm, beatsPerMeasure, timeSignature]);

  // Create combined sequence for playing all
  const handlePlayAll = useCallback(() => {
    const combinedSequence = getCombinedSequence();
    if (combinedSequence) {
      onPlayAll(combinedSequence);
    }
  }, [getCombinedSequence, onPlayAll]);

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

  // State for merge dialog
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSessionIndex, setMergeSessionIndex] = useState(0);
  const [mergeDirection, setMergeDirection] = useState<MergeDirection>("next");

  const openMergeDialog = (index: number, direction: MergeDirection) => {
    setMergeSessionIndex(index);
    setMergeDirection(direction);
    setMergeDialogOpen(true);
  };
  
  const handleMergeConfirm = (gapValue: number, gapUnit: GapUnit) => {
    mergeSessions(mergeSessionIndex, mergeDirection, gapValue, gapUnit);
    setMergeDialogOpen(false);
  };

  // Filter to only valid sessions for display
  const validHistory = history.filter(entry => entry.userSequence.notes.length > 0);

  // Remove a session by index
  const removeSession = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    history,
    addUserSequence,
    clearHistory,
    startNewSession,
    hasValidSessions,
    handlePlayAll,
    isPlayingAll,
    onStopPlayback,
    getCombinedSequence,
    renderHistory: () => (
      <div className="w-full">
        <TrackContainer scrollDependency={[history.length, liveNotes.length]}>
          {/* Completed recordings - left to right */}
          {validHistory.map((entry, displayIndex) => {
            const actualIndex = history.findIndex(h => h === entry);
            return (
              <TrackItem
                key={actualIndex}
                sequence={entry.userSequence}
                onPlay={() => onReplay(entry.userSequence)}
                isFirst={displayIndex === 0}
                isLast={displayIndex === validHistory.length - 1 && !isRecording}
                onMergePrevious={() => openMergeDialog(actualIndex, "previous")}
                onMergeNext={() => openMergeDialog(actualIndex, "next")}
                onRemove={() => removeSession(actualIndex)}
              />
            );
          })}

          {/* Current recording (live) - rightmost */}
          {isRecording && liveSequence && (
            <TrackItem
              sequence={liveSequence}
              isRecording={true}
            />
          )}
        </TrackContainer>

        {/* Merge dialog */}
        <MergeSessionDialog
          sessionIndex={mergeSessionIndex}
          totalSessions={validHistory.length}
          onMerge={(direction, gapValue, gapUnit) => handleMergeConfirm(gapValue, gapUnit)}
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          initialDirection={mergeDirection}
        />
      </div>
    ),
  };
}
