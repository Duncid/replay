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

interface LearnModeProps {
  isLoading: boolean;
  isPlaying: boolean;
  onSubmit: (prompt: string) => void;
  onReplay: (sequence: NoteSequence) => void;
  onClearHistory: () => void;
}

export function LearnMode({ isLoading, isPlaying, onSubmit, onReplay, onClearHistory }: LearnModeProps) {
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

  const render = () => (
    <div className="space-y-8">
      {/* Input Section */}
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

      {/* History Section */}
      {history.length > 0 && (
        <div className="w-full max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">History</h3>
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              Clear
            </Button>
          </div>
          {history.map((entry, index) => (
            <div key={index} className="space-y-3 border border-border rounded-lg p-4 bg-card/50">
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Request {index + 1}: "{entry.prompt}"
              </div>
              <SheetMusic
                sequence={entry.aiSequence}
                label={`AI played: "${entry.prompt}"`}
                isUserNotes={false}
                onReplay={() => onReplay(entry.aiSequence)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return {
    prompt,
    setPrompt,
    history,
    addSession,
    clearHistory,
    render,
  };
}
