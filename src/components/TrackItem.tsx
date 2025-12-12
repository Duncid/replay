import { Button } from "@/components/ui/button";
import { Play, Square, MoreHorizontal, Trash2, Copy, Shuffle, Wand2, Pencil, ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { SheetMusic } from "@/components/SheetMusic";
import { noteSequenceToAbc } from "@/utils/noteSequenceUtils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TrackItemProps {
  id?: string;
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
  onEdit?: (sequence: NoteSequence) => void;
}

export function TrackItem({
  id,
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
  onEdit,
}: TrackItemProps) {
  const { toast } = useToast();

  // Only make sortable if id is provided (not for live recording)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: id || "non-sortable",
    disabled: !id || isRecording,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (!sequence || sequence.notes.length === 0) return null;

  // AI-generated styling uses a blue shade
  const controlBarBg = isAiGenerated ? "bg-blue-500/20" : "bg-muted/50";
  const controlBarBorder = isAiGenerated ? "border-blue-500/30" : "border-border";
  const contentBg = isAiGenerated ? "bg-blue-500/5" : "bg-card/50";
  const contentBorder = isAiGenerated ? "border-blue-500/30" : "border-border";

  // Prevent drag when clicking on buttons
  const handleButtonMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleButtonPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const handleCopySequence = async () => {
    await navigator.clipboard.writeText(JSON.stringify(sequence, null, 2));
    toast({ title: "Copied as NoteSequence" });
  };

  const handleCopyAbc = async () => {
    const abc = noteSequenceToAbc(sequence);
    await navigator.clipboard.writeText(abc);
    toast({ title: "Copied as ABC" });
  };

  const containerRef = id ? setNodeRef : undefined;

  return (
    <div 
      ref={containerRef}
      style={style}
      className={cn(
        "flex flex-col w-fit shrink-0 transition-all duration-300 rounded-md",
        isPlaying && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
        isDragging && "z-50"
      )}
    >
      {/* Control bar */}
      <div 
        {...(id && !isRecording ? { ...attributes, ...listeners } : {})}
        className={cn(
          "flex items-center gap-1 px-2 h-9 rounded-t-md border-b-0 cursor-grab active:cursor-grabbing",
          controlBarBg,
          "border",
          controlBarBorder,
          !id && "cursor-default"
        )}
      >
        {!isRecording && (
          <>
            {isPlaying ? (
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onStop} 
                className="h-6 w-6 cursor-pointer"
                onMouseDown={handleButtonMouseDown}
                onPointerDown={handleButtonPointerDown}
              >
                <Square className="w-3 h-3" fill="currentColor" />
              </Button>
            ) : (
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onPlay} 
                className="h-6 w-6 cursor-pointer"
                onMouseDown={handleButtonMouseDown}
                onPointerDown={handleButtonPointerDown}
              >
                <Play className="w-3 h-3" fill="currentColor" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6 cursor-pointer"
                  onMouseDown={handleButtonMouseDown}
                  onPointerDown={handleButtonPointerDown}
                >
                  <MoreHorizontal className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuItem disabled={isFirst} onClick={onMergePrevious}>
                  <ArrowLeftToLine className="w-3 h-3 mr-2" />
                  Merge with previous
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onClick={onMergeNext}>
                  <ArrowRightToLine className="w-3 h-3 mr-2" />
                  Merge with next
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onEdit && (
                  <>
                    <DropdownMenuItem onClick={() => onEdit(sequence)}>
                      <Pencil className="w-3 h-3 mr-2" />
                      Edit ABC
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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
      <div className={cn(contentBg, "rounded-b-md overflow-hidden", "border", contentBorder)}>
        <SheetMusic sequence={sequence} compact noTitle noControls />
      </div>
    </div>
  );
}
