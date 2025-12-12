import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { NoteSequence, Note } from "@/types/noteSequence";
import { useToast } from "@/hooks/use-toast";

interface AddNoteSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sequence: NoteSequence) => void;
  mode?: 'add' | 'edit';
  onEdit?: (sequence: NoteSequence) => void;
  initialSequence?: NoteSequence;
}

function validateNoteSequence(data: any): data is NoteSequence {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check required fields
  if (!Array.isArray(data.notes)) {
    return false;
  }

  if (typeof data.totalTime !== 'number' || data.totalTime < 0) {
    return false;
  }

  // Validate each note
  for (const note of data.notes) {
    if (!note || typeof note !== 'object') {
      return false;
    }

    if (typeof note.pitch !== 'number' || note.pitch < 0 || note.pitch > 127) {
      return false;
    }

    if (typeof note.startTime !== 'number' || note.startTime < 0) {
      return false;
    }

    if (typeof note.endTime !== 'number' || note.endTime < 0) {
      return false;
    }

    if (note.endTime <= note.startTime) {
      return false;
    }

    if (typeof note.velocity !== 'number' || note.velocity < 0 || note.velocity > 1) {
      return false;
    }
  }

  return true;
}

export function AddNoteSequenceDialog({
  open,
  onOpenChange,
  onAdd,
  mode = 'add',
  onEdit,
  initialSequence,
}: AddNoteSequenceDialogProps) {
  const [jsonText, setJsonText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { toast } = useToast();

  // Update jsonText when dialog opens with initialSequence (edit mode)
  useEffect(() => {
    if (open && initialSequence) {
      setJsonText(JSON.stringify(initialSequence, null, 2));
      setValidationError(null);
    } else if (open && mode === 'add') {
      setJsonText("");
      setValidationError(null);
    }
  }, [open, initialSequence, mode]);

  const handleSubmit = () => {
    if (!jsonText.trim()) {
      toast({ title: "Please enter NoteSequence JSON", variant: "destructive" });
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      
      if (!validateNoteSequence(parsed)) {
        setValidationError("Invalid NoteSequence structure. Required: notes (array), totalTime (number), and each note must have pitch, startTime, endTime, velocity.");
        toast({
          title: "Invalid NoteSequence",
          description: "Please check the structure of your NoteSequence JSON",
          variant: "destructive",
        });
        return;
      }

      const sequence = parsed as NoteSequence;

      if (sequence.notes.length === 0) {
        toast({ title: "No notes found", description: "NoteSequence must contain at least one note", variant: "destructive" });
        return;
      }

      setValidationError(null);

      if (mode === 'edit' && onEdit) {
        onEdit(sequence);
        toast({ title: "Recording updated" });
      } else {
        onAdd(sequence);
        toast({ title: "NoteSequence added" });
      }

      setJsonText("");
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid JSON";
      setValidationError(errorMessage);
      toast({
        title: "Invalid JSON",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && mode === 'add') {
      setJsonText("");
      setValidationError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {mode === 'edit' ? 'Edit NoteSequence' : 'Add NoteSequence'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 flex flex-col space-y-4 py-4 overflow-y-auto min-h-0">
          {validationError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {validationError}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Enter a NoteSequence in JSON format. Required fields: <code className="text-xs">notes</code> (array), <code className="text-xs">totalTime</code> (number). Each note must have: <code className="text-xs">pitch</code>, <code className="text-xs">startTime</code>, <code className="text-xs">endTime</code>, <code className="text-xs">velocity</code>.
          </div>
          <Textarea
            placeholder='{"notes": [{"pitch": 60, "startTime": 0, "endTime": 0.5, "velocity": 0.8}], "totalTime": 0.5}'
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setValidationError(null);
            }}
            className="flex-1 min-h-[200px] font-mono text-sm"
          />
        </div>
        <SheetFooter className="gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{mode === 'edit' ? 'Save' : 'Add'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
