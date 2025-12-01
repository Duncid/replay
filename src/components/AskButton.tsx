import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquare, Send } from "lucide-react";
import { Loader2 } from "lucide-react";

interface AskButtonProps {
  onAskSubmit: (prompt: string) => Promise<void>;
  disabled?: boolean;
}

export const AskButton = ({ onAskSubmit, disabled }: AskButtonProps) => {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    try {
      await onAskSubmit(prompt);
      setPrompt("");
      setOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          Ask AI
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm mb-1">Ask the AI to play something</h4>
            <p className="text-xs text-muted-foreground">
              Try: "play something jazzy", "play a happy melody", or "play the C major scale"
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="play something..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!prompt.trim() || isLoading}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
