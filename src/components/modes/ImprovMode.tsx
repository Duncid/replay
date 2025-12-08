import { useState, useCallback } from "react";
import { SheetMusic } from "@/components/SheetMusic";
import { NoteSequence } from "@/types/noteSequence";

interface ImprovEntry {
  userSequence: NoteSequence;
  aiSequence: NoteSequence;
}

interface ImprovModeProps {
  onReplay: (sequence: NoteSequence) => void;
  onClearHistory: () => void;
}

export function ImprovMode({ onReplay, onClearHistory }: ImprovModeProps) {
  const [history, setHistory] = useState<ImprovEntry[]>([]);

  const addSession = useCallback((userSequence: NoteSequence, aiSequence: NoteSequence) => {
    setHistory((prev) => [...prev, { userSequence, aiSequence }]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  return {
    history,
    addSession,
    clearHistory,
    renderHistory: () => (
      history.length > 0 && (
        <div className="w-full max-w-4xl space-y-4">
          {history.map((entry, index) => (
            <div key={index} className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                Session {index + 1}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <SheetMusic
                  sequence={entry.userSequence}
                  label="You played:"
                  isUserNotes={true}
                  onReplay={() => onReplay(entry.userSequence)}
                />
                <SheetMusic
                  sequence={entry.aiSequence}
                  label="AI responded:"
                  isUserNotes={false}
                  onReplay={() => onReplay(entry.aiSequence)}
                />
              </div>
              {index < history.length - 1 && <div className="border-t border-border mt-4" />}
            </div>
          ))}
        </div>
      )
    ),
  };
}
