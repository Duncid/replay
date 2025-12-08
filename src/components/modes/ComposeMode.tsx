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
        <div className="w-full max-w-4xl space-y-4">
          {history.map((entry, index) => (
            entry.userSequence.notes.length > 0 && (
              <div key={index} className="space-y-3">
                <div className="text-sm font-medium text-muted-foreground">
                  Composition {index + 1}
                </div>
                <SheetMusic
                  sequence={entry.userSequence}
                  label="Your composition:"
                  isUserNotes={true}
                  onReplay={() => onReplay(entry.userSequence)}
                />
                {index < history.length - 1 && <div className="border-t border-border mt-4" />}
              </div>
            )
          ))}
        </div>
      )
    ),
  };
}
