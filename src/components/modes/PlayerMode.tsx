import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SheetMusic } from "@/components/SheetMusic";
import { Loader2, Send } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";

interface PlayerEntry {
  prompt: string;
  aiSequence: NoteSequence;
}

interface PlayerModeProps {
  isLoading: boolean;
  isPlaying: boolean;
  onSubmit: (prompt: string) => void;
  onReplay: (sequence: NoteSequence) => void;
  onClearHistory: () => void;
}

export function PlayerMode({ isLoading, isPlaying, onSubmit, onReplay, onClearHistory }: PlayerModeProps) {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<PlayerEntry[]>([]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt);
  }, [prompt, isLoading, onSubmit]);

  const addSession = useCallback((promptText: string, aiSequence: NoteSequence) => {
    setHistory((prev) => [...prev, { prompt: promptText, aiSequence }]);
    setPrompt("");
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    onClearHistory();
  }, [onClearHistory]);

  return {
    prompt,
    setPrompt,
    history,
    addSession,
    clearHistory,
    renderInput: () => (
      <div className="w-full max-w-2xl mx-auto space-y-3">
        <Textarea
          placeholder="Describe what you'd like the AI to play..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading || isPlaying}
          className="min-h-[120px] text-lg resize-none"
        />
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isLoading || isPlaying}
          className="w-full gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Generate Music
        </Button>
      </div>
    ),
    renderHistory: () => (
      history.length > 0 && (
        <div className="w-full max-w-4xl space-y-4">
          {history.map((entry, index) => (
            <div key={index} className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                Request {index + 1}: "{entry.prompt}"
              </div>
              <SheetMusic
                sequence={entry.aiSequence}
                label={`AI played: "${entry.prompt}"`}
                isUserNotes={false}
                onReplay={() => onReplay(entry.aiSequence)}
              />
              {index < history.length - 1 && <div className="border-t border-border mt-4" />}
            </div>
          ))}
        </div>
      )
    ),
  };
}
