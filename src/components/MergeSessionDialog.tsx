import { useState, useEffect } from "react";
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

  // Auto-select valid direction
  const effectiveDirection = direction === "previous" && !canMergePrevious 
    ? "next" 
    : direction === "next" && !canMergeNext 
      ? "previous" 
      : direction;

  // For controlled mode without trigger
  if (isControlled) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span className="hidden" />
        </PopoverTrigger>
        <PopoverContent className="w-64 bg-popover" align="start">
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Merge Session</h4>
            
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

            <Button onClick={handleMerge} className="w-full" size="sm">
              Merge
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

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
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Merge Session</h4>
          
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

          <Button onClick={handleMerge} className="w-full" size="sm">
            Merge
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
