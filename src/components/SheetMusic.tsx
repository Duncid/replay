import { useEffect, useRef } from "react";
import abcjs from "abcjs";
import { Button } from "@/components/ui/button";
import { Play, MoreHorizontal, Copy } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { noteSequenceToAbc } from "@/utils/noteSequenceUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface SheetMusicProps {
  sequence: NoteSequence;
  onReplay?: () => void;
  label?: string;
  isUserNotes?: boolean;
  compact?: boolean;
  noTitle?: boolean;
  noControls?: boolean;
  width?: number;
}

export const SheetMusic = ({
  sequence,
  onReplay,
  label,
  isUserNotes = false,
  compact = false,
  noTitle = false,
  noControls = false,
  width,
}: SheetMusicProps) => {
  const renderDivRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!sequence || sequence.notes.length === 0 || !renderDivRef.current) return;

    const title = noTitle ? undefined : label || (isUserNotes ? "You played" : "AI responded");
    const abc = noteSequenceToAbc(sequence, title);

    renderDivRef.current.innerHTML = "";

    let options;
    if (compact && width) {
      // Use width-based staffwidth for duration-proportional sizing
      const staffwidth = Math.max(100, width - 20); // Account for padding
      options = { staffwidth, scale: 0.9, add_classes: true };
    } else if (compact) {
      options = { staffwidth: 400, scale: 0.9, add_classes: true };
    } else {
      options = { responsive: "resize" as const, staffwidth: 600, scale: 0.8, add_classes: true };
    }

    abcjs.renderAbc(renderDivRef.current, abc, options);
  }, [sequence, label, isUserNotes, compact, noTitle, width]);

  const handleCopySequence = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(sequence, null, 2));
      toast({ title: "Copied", description: "NoteSequence copied to clipboard" });
    } catch {
      toast({ title: "Error", description: "Failed to copy", variant: "destructive" });
    }
  };

  if (!sequence || sequence.notes.length === 0) return null;

  if (compact) {
    // Minimal view for TrackItem - just the sheet music
    if (noControls) {
      return (
        <div
          ref={renderDivRef}
          className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground"
        />
      );
    }

    return (
      <div className="bg-card/50 border border-border/50 rounded-md p-2">
        <div className="flex items-center gap-2">
          <div
            ref={renderDivRef}
            className="flex-1 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground"
          />
          <div className="flex items-center gap-1 shrink-0">
            {onReplay && (
              <Button variant="ghost" size="sm" onClick={onReplay} className="h-7 w-7 p-0">
                <Play className="w-3.5 h-3.5" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={handleCopySequence}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy NoteSequence
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          {label || (isUserNotes ? "You played:" : "AI responded:")}
        </h3>
        <div className="flex items-center gap-1">
          {onReplay && (
            <Button variant="outline" size="sm" onClick={onReplay} className="gap-2">
              <Play className="w-3 h-3" />
              Replay
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopySequence}>
                <Copy className="w-4 h-4 mr-2" />
                Copy NoteSequence
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        ref={renderDivRef}
        className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground"
      />
    </div>
  );
};
