import { Trans, useTranslation } from "react-i18next";
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

function validateNoteSequence(value: unknown): value is NoteSequence {
  const data = value as Partial<NoteSequence> | null;
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
  const { t } = useTranslation();
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
      toast({ title: t("sequenceEditor.empty"), variant: "destructive" });
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      
      if (!validateNoteSequence(parsed)) {
        setValidationError(t("sequenceEditor.structure"));
        toast({
          title: t("sequenceEditor.invalid"),
          description: t("sequenceEditor.check"),
          variant: "destructive",
        });
        return;
      }

      const sequence = parsed as NoteSequence;

      if (sequence.notes.length === 0) {
        toast({ title: t("sequenceEditor.noNotes"), description: t("sequenceEditor.minNotes"), variant: "destructive" });
        return;
      }

      setValidationError(null);

      if (mode === 'edit' && onEdit) {
        onEdit(sequence);
        toast({ title: t("sequenceEditor.updated") });
      } else {
        onAdd(sequence);
        toast({ title: t("sequenceEditor.added") });
      }

      setJsonText("");
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("sequenceEditor.invalidJson");
      setValidationError(errorMessage);
      toast({
        title: t("sequenceEditor.invalidJson"),
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
            {mode === 'edit' ? t("sequenceEditor.edit") : t("sequenceEditor.add")}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 flex flex-col space-y-4 py-4 overflow-y-auto min-h-0">
          {validationError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {validationError}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            <Trans i18nKey="sequenceEditor.help" components={{ field: <code className="text-xs" /> }} />
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
        <SheetFooter className="gap-2 shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("menus.cancel")}
          </Button>
          <Button onClick={handleSubmit}>{mode === 'edit' ? t("menus.save") : t("questEditor.add")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
