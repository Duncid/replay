import { useState, useCallback } from "react";
import { SheetMusic } from "@/components/SheetMusic";
import { NoteSequence, Note } from "@/types/noteSequence";
import { createEmptyNoteSequence } from "@/utils/noteSequenceUtils";

interface ComposeEntry {
  userSequence: NoteSequence;
}

interface ComposeModeProps {
  bpm: number;
  timeSignature: string;
  onReplay: (sequence: NoteSequence) => void;
  onClearHistory: () => void;
  liveNotes?: Note[]; // Notes currently being recorded (for live display)
  isRecording?: boolean;
}

export function ComposeMode({ 
  bpm, 
  timeSignature, 
  onReplay, 
  onClearHistory,
  liveNotes = [],
  isRecording = false,
}: ComposeModeProps) {
  const [history, setHistory] = useState<ComposeEntry[]>([]);

  const addUserSequence = useCallback((userSequence: NoteSequence) => {
    setHistory((prev) => {
      if (prev.length > 0) {
        const lastSession = prev[prev.length - 1];
        // Append to existing session - offset new notes by the previous sequence's totalTime
        const timeOffset = lastSession.userSequence.totalTime;
        const offsetNotes = userSequence.notes.map((note) => ({
          ...note,
          startTime: note.startTime + timeOffset,
          endTime: note.endTime + timeOffset,
        }));
        const updatedUserSequence: NoteSequence = {
          ...lastSession.userSequence,
          notes: [...lastSession.userSequence.notes, ...offsetNotes],
          totalTime: timeOffset + userSequence.totalTime,
        };
        return [...prev.slice(0, -1), { userSequence: updatedUserSequence }];
      }
      return [...prev, { userSequence }];
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  const startNewSession = useCallback(() => {
    // Add an empty placeholder so the next recording starts fresh
    setHistory((prev) => [...prev, { userSequence: createEmptyNoteSequence(bpm, timeSignature) }]);
  }, [bpm, timeSignature]);

  // Create a live sequence from current notes for real-time display
  const liveSequence: NoteSequence | null = liveNotes.length > 0 ? {
    notes: liveNotes,
    totalTime: Math.max(...liveNotes.map(n => n.endTime), 0),
    tempos: [{ time: 0, qpm: bpm }],
    timeSignatures: [{ 
      time: 0, 
      numerator: parseInt(timeSignature.split('/')[0]), 
      denominator: parseInt(timeSignature.split('/')[1]) 
    }],
  } : null;

  return {
    history,
    addUserSequence,
    clearHistory,
    startNewSession,
    renderHistory: () => (
      <>
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
                <SheetMusic
                  key={index}
                  sequence={entry.userSequence}
                  isUserNotes={true}
                  onReplay={() => onReplay(entry.userSequence)}
                  compact
                />
              )
            ))}
          </div>
        )}
      </>
    ),
  };
}
