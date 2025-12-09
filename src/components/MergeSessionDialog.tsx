import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Merge, ChevronLeft, ChevronRight } from "lucide-react";

type GapUnit = "beats" | "measures";
type MergeDirection = "previous" | "next";

interface MergeSessionDialogProps {
  sessionIndex: number;
  totalSessions: number;
  onMerge: (direction: MergeDirection, gapValue: number, gapUnit: GapUnit) => void;
  // Controlled mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialDirection?: MergeDirection;
}

function MergeContent({
  direction,
  setDirection,
  canMergePrevious,
  canMergeNext,
  gapValue,
  setGapValue,
  gapUnit,
  setGapUnit,
  onMerge,
}: {
  direction: MergeDirection;
  setDirection: (d: MergeDirection) => void;
  canMergePrevious: boolean;
  canMergeNext: boolean;
  gapValue: number;
  setGapValue: (v: number) => void;
  gapUnit: GapUnit;
  setGapUnit: (u: GapUnit) => void;
  onMerge: () => void;
}) {
  const effectiveDirection = direction === "previous" && !canMergePrevious 
    ? "next" 
    : direction === "next" && !canMergeNext 
      ? "previous" 
      : direction;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Direction</Label>
        <div className="flex gap-2">
          <Button
            variant={effectiveDirection === "previous" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-1"
            disabled={!canMergePrevious}
            onClick={() => setDirection("previous")}
          >
            <ChevronLeft className="h-3 w-3" />
            Previous
          </Button>
          <Button
            variant={effectiveDirection === "next" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-1"
            disabled={!canMergeNext}
            onClick={() => setDirection("next")}
          >
            <ChevronRight className="h-3 w-3" />
            Next
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Gap between sessions</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            max={16}
            value={gapValue}
            onChange={(e) => setGapValue(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-16"
          />
          <Select value={gapUnit} onValueChange={(v) => setGapUnit(v as GapUnit)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beats">Beats</SelectItem>
              <SelectItem value="measures">Measures</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={onMerge} className="w-full" size="sm">
        Merge
      </Button>
    </div>
  );
}

export function MergeSessionDialog({
  sessionIndex,
  totalSessions,
  onMerge,
  open: controlledOpen,
  onOpenChange,
  initialDirection,
}: MergeSessionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [direction, setDirection] = useState<MergeDirection>(initialDirection || "previous");
  const [gapValue, setGapValue] = useState(1);
  const [gapUnit, setGapUnit] = useState<GapUnit>("measures");

  // Use controlled or uncontrolled mode
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;

  // Update direction when initialDirection changes (controlled mode)
  useEffect(() => {
    if (initialDirection) {
      setDirection(initialDirection);
    }
  }, [initialDirection]);

  const canMergePrevious = sessionIndex > 0;
  const canMergeNext = sessionIndex < totalSessions - 1;

  const handleMerge = () => {
    onMerge(direction, gapValue, gapUnit);
    setOpen(false);
  };

  // For controlled mode, use a Dialog (centered modal)
  if (isControlled) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[280px]">
          <DialogHeader>
            <DialogTitle>Merge Session</DialogTitle>
          </DialogHeader>
          <MergeContent
            direction={direction}
            setDirection={setDirection}
            canMergePrevious={canMergePrevious}
            canMergeNext={canMergeNext}
            gapValue={gapValue}
            setGapValue={setGapValue}
            gapUnit={gapUnit}
            setGapUnit={setGapUnit}
            onMerge={handleMerge}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Uncontrolled mode with inline trigger button
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!canMergePrevious && !canMergeNext}
        >
          <Merge className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-popover" align="end">
        <h4 className="font-medium text-sm mb-4">Merge Session</h4>
        <MergeContent
          direction={direction}
          setDirection={setDirection}
          canMergePrevious={canMergePrevious}
          canMergeNext={canMergeNext}
          gapValue={gapValue}
          setGapValue={setGapValue}
          gapUnit={gapUnit}
          setGapUnit={setGapUnit}
          onMerge={handleMerge}
        />
      </PopoverContent>
    </Popover>
  );
}
