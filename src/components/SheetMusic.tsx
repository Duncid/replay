import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNoteColorForNoteName } from "@/constants/noteColors";
import { useToast } from "@/hooks/use-toast";
import { NoteSequence } from "@/types/noteSequence";
import { midiToNoteName, noteSequenceToAbc } from "@/utils/noteSequenceUtils";
import abcjs from "abcjs";
import { Copy, MoreHorizontal, Play } from "lucide-react";
import { useEffect, useRef } from "react";

interface SheetMusicProps {
  sequence: NoteSequence;
  onReplay?: () => void;
  label?: string;
  isUserNotes?: boolean;
  compact?: boolean;
  noTitle?: boolean;
  noControls?: boolean;
  hasColor?: boolean;
  scale?: number;
}

export const SheetMusic = ({
  sequence,
  onReplay,
  label,
  isUserNotes = false,
  compact = false,
  noTitle = false,
  noControls = false,
  hasColor = false,
  scale,
}: SheetMusicProps) => {
  const renderDivRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const containerWidth = sequence ? Math.max(48, sequence.totalTime * 48) : 48;
  const renderScale = scale ?? 0.8;

  const applyNoteColors = () => {
    if (!hasColor || !renderDivRef.current || !sequence.notes?.length) return;

    const notesByStartTime = new Map<number, typeof sequence.notes>();
    sequence.notes.forEach((note) => {
      const key = Math.round(note.startTime * 1000);
      if (!notesByStartTime.has(key)) {
        notesByStartTime.set(key, []);
      }
      notesByStartTime.get(key)!.push(note);
    });

    const sortedKeys = Array.from(notesByStartTime.keys()).sort(
      (a, b) => a - b,
    );
    const noteColors: Array<string | undefined> = [];

    sortedKeys.forEach((key) => {
      const notes = notesByStartTime.get(key) ?? [];
      notes.forEach((note) => {
        const noteName = midiToNoteName(note.pitch);
        noteColors.push(getNoteColorForNoteName(noteName));
      });
    });

    const noteElements =
      renderDivRef.current.querySelectorAll<SVGElement>(".abcjs-note");
    noteElements.forEach((element, index) => {
      const color = noteColors[index];
      if (!color) return;

      element.setAttribute("fill", color);
      element.setAttribute("stroke", color);
      element
        .querySelectorAll<SVGElement>("path, ellipse, circle")
        .forEach((child) => {
          child.setAttribute("fill", color);
          child.setAttribute("stroke", color);
        });
    });
  };

  useEffect(() => {
    if (!sequence || sequence.notes.length === 0 || !renderDivRef.current)
      return;

    const title = noTitle
      ? undefined
      : label || (isUserNotes ? "You played" : "AI responded");
    const abc = noteSequenceToAbc(sequence, title);

    renderDivRef.current.innerHTML = "";

    const options = compact
      ? { staffwidth: containerWidth, scale: renderScale, add_classes: true }
      : {
          responsive: "resize" as const,
          staffwidth: 600,
          scale: renderScale,
          add_classes: true,
        };

    abcjs.renderAbc(renderDivRef.current, abc, options);
    applyNoteColors();
  }, [sequence, label, isUserNotes, compact, noTitle, renderScale, hasColor]);

  const handleCopySequence = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(sequence, null, 2));
      toast({
        title: "Copied",
        description: "NoteSequence copied to clipboard",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  if (!sequence || sequence.notes.length === 0) return null;

  if (compact) {
    // Minimal view for TrackItem - just the sheet music
    if (noControls) {
      return (
        <div
          ref={renderDivRef}
          style={{
            width: containerWidth,
            minWidth: containerWidth,
            height: 64,
          }}
          className="overflow-hidden [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground [&_.abcjs-staff]:opacity-50 [&_.abcjs-staff_line]:opacity-50 [&_.abcjs-staff line]:opacity-50 [&_.abcjs-staff path]:opacity-50"
        />
      );
    }

    return (
      <div
        style={{ width: containerWidth }}
        className="bg-card/50 border border-border/50 rounded-md p-2"
      >
        <div className="flex items-center gap-2">
          <div
            ref={renderDivRef}
            className="flex-1 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground [&_.abcjs-staff]:opacity-50 [&_.abcjs-staff_line]:opacity-50 [&_.abcjs-staff line]:opacity-50 [&_.abcjs-staff path]:opacity-50"
          />
          <div className="flex items-center gap-1 shrink-0">
            {onReplay && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReplay}
                className="h-7 w-7 p-0"
              >
                <Play fill="currentColor" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={handleCopySequence}>
                  <Copy />
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
            <Button variant="outline" size="sm" onClick={onReplay}>
              <Play fill="currentColor" />
              Replay
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopySequence}>
                <Copy />
                Copy NoteSequence
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        ref={renderDivRef}
        className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground [&_.abcjs-staff]:opacity-50 [&_.abcjs-staff_line]:opacity-50 [&_.abcjs-staff line]:opacity-50 [&_.abcjs-staff path]:opacity-50"
      />
    </div>
  );
};
