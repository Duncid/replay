import { useState, useCallback } from "react";
import { SheetMusic } from "@/components/SheetMusic";
import { NoteSequence } from "@/types/noteSequence";
import { createEmptyNoteSequence } from "@/utils/noteSequenceUtils";

interface ComposeEntry {
  userSequence: NoteSequence;
}

interface ComposeModeProps {
  bpm: number;
  timeSignature: string;
  onReplay: (sequence: NoteSequence) => void;
  onClearHistory: () => void;
}

export function ComposeMode({ bpm, timeSignature, onReplay, onClearHistory }: ComposeModeProps) {
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

  return {
    history,
    addUserSequence,
    clearHistory,
    startNewSession,
    renderHistory: () => (
      history.length > 0 && (
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
      )
    ),
  };
}
