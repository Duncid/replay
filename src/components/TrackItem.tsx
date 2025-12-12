import { Button } from "@/components/ui/button";
import { Play, Square, MoreHorizontal, Trash2, Copy, Shuffle, Wand2 } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { SheetMusic } from "@/components/SheetMusic";
import { noteSequenceToAbc } from "@/utils/noteSequenceUtils";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TrackItemProps {
  sequence: NoteSequence;
  onPlay?: () => void;
  onStop?: () => void;
  isPlaying?: boolean;
  isRecording?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMergePrevious?: () => void;
  onMergeNext?: () => void;
  onRemove?: () => void;
  isAiGenerated?: boolean;
  onRequestImprov?: (sequence: NoteSequence) => void;
  onRequestVariations?: (sequence: NoteSequence) => void;
}

export function TrackItem({
  sequence,
  onPlay,
  onStop,
  isPlaying = false,
  isRecording = false,
  isFirst = false,
  isLast = false,
  onMergePrevious,
  onMergeNext,
  onRemove,
  isAiGenerated = false,
  onRequestImprov,
  onRequestVariations,
}: TrackItemProps) {
  const { toast } = useToast();

  if (!sequence || sequence.notes.length === 0) return null;

  // AI-generated styling uses a blue shade
  const controlBarBg = isAiGenerated ? "bg-blue-500/20" : "bg-muted/50";
  const controlBarBorder = isAiGenerated ? "border-blue-500/30" : "border-border/50";
  const contentBg = isAiGenerated ? "bg-blue-500/5" : "bg-card/50";
  const contentBorder = isAiGenerated ? "border-blue-500/30" : "border-border/50";

  const handleCopySequence = async () => {
    await navigator.clipboard.writeText(JSON.stringify(sequence, null, 2));
    toast({ title: "Copied as NoteSequence" });
  };

  const handleCopyAbc = async () => {
    const abc = noteSequenceToAbc(sequence);
    await navigator.clipboard.writeText(abc);
    toast({ title: "Copied as ABC" });
  };

  return (
    <div className={`flex flex-col w-fit shrink-0 transition-all duration-300 rounded-md ${isPlaying ? "ring-2 ring-primary ring-offset-2" : ""}`}>
      {/* Control bar */}
      <div className={`flex items-center gap-1 px-2 h-9 ${controlBarBg} rounded-t-md border border-b-0 ${controlBarBorder}`}>
        {!isRecording && (
          <>
            {isPlaying ? (
              <Button size="icon" variant="ghost" onClick={onStop} className="h-6 w-6">
                <Square className="w-3 h-3" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={onPlay} className="h-6 w-6">
                <Play className="w-3 h-3" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-6 w-6">
                  <MoreHorizontal className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuItem disabled={isFirst} onClick={onMergePrevious}>
                  Merge with previous
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onClick={onMergeNext}>
                  Merge with next
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onRequestImprov && (
                  <DropdownMenuItem onClick={() => onRequestImprov(sequence)}>
                    <Wand2 className="w-3 h-3 mr-2" />
                    Improvise
                  </DropdownMenuItem>
                )}
                {onRequestVariations && (
                  <DropdownMenuItem onClick={() => onRequestVariations(sequence)}>
                    <Shuffle className="w-3 h-3 mr-2" />
                    Create variations
                  </DropdownMenuItem>
                )}
                {(onRequestImprov || onRequestVariations) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={handleCopySequence}>
                  <Copy className="w-3 h-3 mr-2" />
                  Copy as NoteSequence
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyAbc}>
                  <Copy className="w-3 h-3 mr-2" />
                  Copy as ABC
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-3 h-3 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {isRecording && <span className="text-xs text-muted-foreground px-1">Recording...</span>}
      </div>
      {/* Sheet music - no title, no controls */}
      <div className={`${contentBg} border ${contentBorder} rounded-b-md overflow-hidden`}>
        <SheetMusic sequence={sequence} compact noTitle noControls />
      </div>
    </div>
  );
}
