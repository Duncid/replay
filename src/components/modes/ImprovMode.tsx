import { useState, useCallback, useEffect } from "react";
import { NoteSequence, Note } from "@/types/noteSequence";
import { beatsToSeconds } from "@/utils/noteSequenceUtils";
import { TrackContainer } from "@/components/TrackContainer";
import { TrackItem } from "@/components/TrackItem";
import { MergeSessionDialog } from "@/components/MergeSessionDialog";

// Single-entry model - same as ComposeMode but with isAiGenerated flag
export interface TrackEntry {
  sequence: NoteSequence;
  isAiGenerated: boolean;
}

type GapUnit = "beats" | "measures";
type MergeDirection = "previous" | "next";

interface ImprovModeProps {
  bpm: number;
  timeSignature: string;
  onReplay: (sequence: NoteSequence) => void;
  onPlayAll: (combinedSequence: NoteSequence) => void;
  onStopPlayback: () => void;
  onClearHistory: () => void;
  liveNotes?: Note[];
  isRecording?: boolean;
  isPlayingAll?: boolean;
  initialHistory?: TrackEntry[];
  onHistoryChange?: (history: TrackEntry[]) => void;
  onRequestImprov?: (sequence: NoteSequence) => void;
  onRequestVariations?: (sequence: NoteSequence) => void;
}

export function ImprovMode({
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
  onRequestImprov,
  onRequestVariations,
}: ImprovModeProps) {
  const [history, setHistory] = useState<TrackEntry[]>(initialHistory);

  const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);

  // Notify parent when history changes
  useEffect(() => {
    onHistoryChange?.(history);
  }, [history, onHistoryChange]);

  // Add a single entry (user or AI)
  const addEntry = useCallback((sequence: NoteSequence, isAiGenerated: boolean) => {
    setHistory((prev) => [...prev, { sequence, isAiGenerated }]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  // Merge two adjacent entries - result inherits isAiGenerated from target (left entry)
  const mergeSessions = useCallback((
    targetIndex: number,
    sourceIndex: number,
    gapValue: number,
    gapUnit: GapUnit
  ) => {
    setHistory((prev) => {
      if (targetIndex < 0 || sourceIndex >= prev.length) return prev;

      const target = prev[targetIndex];
      const source = prev[sourceIndex];

      // Calculate gap in seconds
      const gapInBeats = gapUnit === "measures" ? gapValue * beatsPerMeasure : gapValue;
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

      // Result inherits isAiGenerated from TARGET (merge AI into human = human)
      const mergedEntry: TrackEntry = {
        sequence: mergedSequence,
        isAiGenerated: target.isAiGenerated,
      };

      // Remove the source and replace target with merged
      const newHistory = [...prev];
      newHistory[targetIndex] = mergedEntry;
      newHistory.splice(sourceIndex, 1);

      return newHistory;
    });
  }, [bpm, beatsPerMeasure]);

  // Build combined sequence from all entries
  const getCombinedSequence = useCallback((): NoteSequence | null => {
    if (history.length === 0) return null;

    // Half measure gap between entries
    const measureGapSeconds = beatsToSeconds(beatsPerMeasure / 2, bpm);

    let combinedNotes: Note[] = [];
    let currentTime = 0;

    history.forEach((entry, index) => {
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

    return {
      notes: combinedNotes,
      totalTime: currentTime,
      tempos: [{ time: 0, qpm: bpm }],
      timeSignatures: [{ time: 0, numerator: beatsPerMeasure, denominator: parseInt(timeSignature.split('/')[1]) }],
    };
  }, [history, bpm, beatsPerMeasure, timeSignature]);

  // Handle playing all sequences
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

  const hasValidSessions = history.some(entry => entry.sequence.notes.length > 0);

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
    const targetIndex = mergeDirection === "previous" ? mergeEntryIndex - 1 : mergeEntryIndex;
    const sourceIndex = mergeDirection === "previous" ? mergeEntryIndex : mergeEntryIndex + 1;
    mergeSessions(targetIndex, sourceIndex, gapValue, gapUnit);
    setMergeDialogOpen(false);
  };

  // Remove an entry by index
  const removeEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    history,
    addEntry,
    clearHistory,
    hasValidSessions,
    handlePlayAll,
    isPlayingAll,
    onStopPlayback,
    getCombinedSequence,
    renderHistory: () => (
      <div className="w-full">
        <TrackContainer scrollDependency={[history.length, liveNotes.length]}>
          {/* All entries - each with full controls */}
          {history.map((entry, index) => (
            <TrackItem
              key={index}
              sequence={entry.sequence}
              onPlay={() => onReplay(entry.sequence)}
              isFirst={index === 0}
              isLast={index === history.length - 1 && !isRecording}
              isAiGenerated={entry.isAiGenerated}
              onMergePrevious={index > 0 ? () => openMergeDialog(index, "previous") : undefined}
              onMergeNext={index < history.length - 1 ? () => openMergeDialog(index, "next") : undefined}
              onRemove={() => removeEntry(index)}
              onRequestImprov={onRequestImprov}
              onRequestVariations={onRequestVariations}
            />
          ))}

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
          sessionIndex={mergeEntryIndex}
          totalSessions={history.length}
          onMerge={(direction, gapValue, gapUnit) => handleMergeConfirm(gapValue, gapUnit)}
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          initialDirection={mergeDirection}
        />
      </div>
    ),
  };
}
