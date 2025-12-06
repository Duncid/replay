import { useEffect, useRef } from "react";
import abcjs from "abcjs";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { noteSequenceToAbc } from "@/utils/noteSequenceUtils";

interface SheetMusicProps {
  sequence: NoteSequence;
  onReplay?: () => void;
  label?: string;
  isUserNotes?: boolean;
}

export const SheetMusic = ({ sequence, onReplay, label, isUserNotes = false }: SheetMusicProps) => {
  const renderDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sequence || sequence.notes.length === 0 || !renderDivRef.current) return;

    // Convert NoteSequence to ABC notation
    const abc = noteSequenceToAbc(sequence, label || (isUserNotes ? "You played" : "AI responded"));

    // Clear previous render
    renderDivRef.current.innerHTML = "";

    // Render ABC notation to SVG
    abcjs.renderAbc(renderDivRef.current, abc, {
      responsive: "resize",
      staffwidth: 600,
      scale: 0.8,
      add_classes: true,
    });
  }, [sequence, label, isUserNotes]);

  if (!sequence || sequence.notes.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          {label || (isUserNotes ? "You played:" : "AI responded:")}
        </h3>
        {onReplay && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReplay}
            className="gap-2"
          >
            <Play className="w-3 h-3" />
            Replay
          </Button>
        )}
      </div>
      <div
        ref={renderDivRef}
        className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto [&_path]:stroke-foreground [&_text]:fill-foreground"
      />
    </div>
  );
};
