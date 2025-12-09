import { useState, useCallback, useRef, useEffect } from "react";
import { NoteSequence, Note } from "@/types/noteSequence";
import { createEmptyNoteSequence, beatsToSeconds } from "@/utils/noteSequenceUtils";
import { TrackContainer } from "@/components/TrackContainer";
import { TrackItem } from "@/components/TrackItem";
import { MergeSessionDialog } from "@/components/MergeSessionDialog";

interface ImprovEntry {
  userSequence: NoteSequence;
  aiSequence: NoteSequence;
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
}: ImprovModeProps) {
  const [history, setHistory] = useState<ImprovEntry[]>([]);

  const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);

  const addSession = useCallback((userSequence: NoteSequence, aiSequence: NoteSequence) => {
    setHistory((prev) => [...prev, { userSequence, aiSequence }]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  // Merge two sessions with a gap (combines user+AI pairs)
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

      // Target total time is max of user and AI
      const targetTotalTime = Math.max(
        targetSession.userSequence.totalTime,
        targetSession.aiSequence.totalTime
      );

      // Offset source notes
      const timeOffset = targetTotalTime + gapSeconds;

      const offsetUserNotes = sourceSession.userSequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + timeOffset,
        endTime: note.endTime + timeOffset,
      }));

      const offsetAiNotes = sourceSession.aiSequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + timeOffset,
        endTime: note.endTime + timeOffset,
      }));

      const mergedUserSequence: NoteSequence = {
        ...targetSession.userSequence,
        notes: [...targetSession.userSequence.notes, ...offsetUserNotes],
        totalTime: timeOffset + sourceSession.userSequence.totalTime,
      };

      const mergedAiSequence: NoteSequence = {
        ...targetSession.aiSequence,
        notes: [...targetSession.aiSequence.notes, ...offsetAiNotes],
        totalTime: timeOffset + sourceSession.aiSequence.totalTime,
      };

      // Remove the source and replace target with merged
      const newHistory = [...prev];
      newHistory[targetIndex] = { userSequence: mergedUserSequence, aiSequence: mergedAiSequence };
      newHistory.splice(sourceIndex, 1);

      return newHistory;
    });
  }, [bpm, beatsPerMeasure]);

  // Build combined sequence from all sessions (both user and AI interleaved)
  const getCombinedSequence = useCallback((): NoteSequence | null => {
    if (history.length === 0) return null;

    // One measure gap between sessions
    const measureGapSeconds = beatsToSeconds(beatsPerMeasure, bpm);

    let combinedNotes: Note[] = [];
    let currentTime = 0;

    history.forEach((entry, index) => {
      // Add user notes with time offset
      const offsetUserNotes = entry.userSequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + currentTime,
        endTime: note.endTime + currentTime,
      }));
      combinedNotes = [...combinedNotes, ...offsetUserNotes];

      // Add AI notes with time offset
      const offsetAiNotes = entry.aiSequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime + currentTime,
        endTime: note.endTime + currentTime,
      }));
      combinedNotes = [...combinedNotes, ...offsetAiNotes];

      // Session total time is max of user and AI
      currentTime += Math.max(entry.userSequence.totalTime, entry.aiSequence.totalTime);

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

  const hasValidSessions = history.some(entry =>
    entry.userSequence.notes.length > 0 || entry.aiSequence.notes.length > 0
  );

  // Track container ref for auto-scroll
  const trackContainerRef = useRef<HTMLDivElement>(null);

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

  // Remove a session by index
  const removeSession = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Flatten history for display: each entry has user + AI tracks
  const flattenedTracks = history.flatMap((entry, sessionIndex) => [
    { sequence: entry.userSequence, isAi: false, sessionIndex },
    { sequence: entry.aiSequence, isAi: true, sessionIndex },
  ]).filter(track => track.sequence.notes.length > 0);

  return {
    history,
    addSession,
    clearHistory,
    hasValidSessions,
    handlePlayAll,
    isPlayingAll,
    onStopPlayback,
    getCombinedSequence,
    renderHistory: () => (
      <div className="w-full">
        <TrackContainer scrollDependency={[history.length, liveNotes.length]}>
          {/* Completed recordings - pairs of user/AI */}
          {flattenedTracks.map((track, displayIndex) => (
            <TrackItem
              key={`${track.sessionIndex}-${track.isAi ? 'ai' : 'user'}`}
              sequence={track.sequence}
              onPlay={() => onReplay(track.sequence)}
              isFirst={displayIndex === 0}
              isLast={displayIndex === flattenedTracks.length - 1 && !isRecording}
              isAiGenerated={track.isAi}
              onMergePrevious={!track.isAi ? () => openMergeDialog(track.sessionIndex, "previous") : undefined}
              onMergeNext={!track.isAi ? () => openMergeDialog(track.sessionIndex, "next") : undefined}
              onRemove={!track.isAi ? () => removeSession(track.sessionIndex) : undefined}
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
          sessionIndex={mergeSessionIndex}
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
