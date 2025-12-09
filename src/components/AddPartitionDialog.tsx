import { useState } from "react";
import { Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { abcToNoteSequence } from "@/utils/noteSequenceUtils";
import { NoteSequence } from "@/types/noteSequence";
import { useToast } from "@/hooks/use-toast";

interface AddPartitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sequence: NoteSequence) => void;
  bpm: number;
}

export function AddPartitionDialog({
  open,
  onOpenChange,
  onAdd,
  bpm,
}: AddPartitionDialogProps) {
  const [abcText, setAbcText] = useState("");
  const { toast } = useToast();

  const handleAdd = () => {
    if (!abcText.trim()) {
      toast({ title: "Please enter ABC notation", variant: "destructive" });
      return;
    }

    try {
      const sequence = abcToNoteSequence(abcText, bpm);
      if (sequence.notes.length === 0) {
        toast({ title: "No valid notes found in ABC notation", variant: "destructive" });
        return;
      }
      onAdd(sequence);
      setAbcText("");
      onOpenChange(false);
      toast({ title: "Partition added" });
    } catch (error) {
      toast({ title: "Invalid ABC notation", variant: "destructive" });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setAbcText("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            Add Partition
          </DialogTitle>
          <DialogDescription>
            Paste ABC notation to add it as a new track.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="E E G E | C C C/2 D/2 E/2 z/ | E E G E | A,2"
          value={abcText}
          onChange={(e) => setAbcText(e.target.value)}
          className="min-h-[150px] font-mono text-sm"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
