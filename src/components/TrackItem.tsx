import { Button } from "@/components/ui/button";
import { Play, Square, MoreHorizontal } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { SheetMusic } from "@/components/SheetMusic";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
}

const PIXELS_PER_SECOND = 48;
const MIN_WIDTH = 48;

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
}: TrackItemProps) {
  if (!sequence || sequence.notes.length === 0) return null;

  const itemWidth = Math.max(MIN_WIDTH, Math.ceil((sequence.totalTime || 1) * PIXELS_PER_SECOND));

  return (
    <div className="flex flex-col shrink-0" style={{ width: `${itemWidth}px` }}>
      {/* Control bar */}
      <div className="flex items-center gap-1 px-2 h-9 bg-muted/50 rounded-t-md border border-b-0 border-border/50">
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
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {isRecording && <span className="text-xs text-muted-foreground px-1">Recording...</span>}
      </div>
      {/* Sheet music - no title, no controls */}
      <div className="bg-card/50 border border-border/50 rounded-b-md overflow-hidden">
        <SheetMusic sequence={sequence} compact noTitle noControls width={itemWidth} />
      </div>
    </div>
  );
}
