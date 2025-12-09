import { useState, useMemo, useRef, useCallback } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { abcToNoteSequence, midiToFrequency } from "@/utils/noteSequenceUtils";
import { NoteSequence } from "@/types/noteSequence";
import { useToast } from "@/hooks/use-toast";
import { SheetMusic } from "@/components/SheetMusic";
import { usePianoAudio } from "@/hooks/usePianoAudio";

interface AddPartitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sequence: NoteSequence) => void;
  bpm: number;
}

export function AddPartitionDialog({ open, onOpenChange, onAdd, bpm }: AddPartitionDialogProps) {
  const [abcText, setAbcText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const { toast } = useToast();
  const { ensureAudioReady, playNote } = usePianoAudio();

  const previewSequence = useMemo(() => {
    if (!abcText.trim()) return null;
    try {
      const seq = abcToNoteSequence(abcText, bpm);
      return seq.notes.length > 0 ? seq : null;
    } catch {
      return null;
    }
  }, [abcText, bpm]);

  const handlePlay = useCallback(async () => {
    if (!previewSequence || previewSequence.notes.length === 0) return;
    
    await ensureAudioReady();
    setIsPlaying(true);
    playbackRef.current = { cancelled: false };
    
    const sortedNotes = [...previewSequence.notes].sort((a, b) => a.startTime - b.startTime);
    const startTime = performance.now();
    
    for (const note of sortedNotes) {
      if (playbackRef.current.cancelled) break;
      
      const noteStartMs = note.startTime * 1000;
      const elapsed = performance.now() - startTime;
      const delay = noteStartMs - elapsed;
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      if (playbackRef.current.cancelled) break;
      
      const frequency = midiToFrequency(note.pitch);
      const duration = note.endTime - note.startTime;
      playNote(frequency, duration);
    }
    
    // Wait for last note to finish
    const lastNote = sortedNotes[sortedNotes.length - 1];
    if (lastNote && !playbackRef.current.cancelled) {
      const lastNoteDuration = (lastNote.endTime - lastNote.startTime) * 1000;
      await new Promise(resolve => setTimeout(resolve, lastNoteDuration));
    }
    
    setIsPlaying(false);
  }, [previewSequence, ensureAudioReady, playNote]);

  const handleStop = useCallback(() => {
    playbackRef.current.cancelled = true;
    setIsPlaying(false);
  }, []);

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
          <DialogTitle className="flex items-center gap-2">Add Partition</DialogTitle>
        </DialogHeader>
        {previewSequence && (
          <div className="flex items-start gap-2 border border-border rounded-md p-2 bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8"
              onClick={isPlaying ? handleStop : handlePlay}
            >
              {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="overflow-x-auto flex-1">
              <SheetMusic sequence={previewSequence} compact noControls noTitle />
            </div>
          </div>
        )}
        <Textarea
          placeholder="E E G E | C C C/2 D/2 E/2 z/ | E E G E | A,2"
          value={abcText}
          onChange={(e) => setAbcText(e.target.value)}
          className="min-h-[100px] font-mono text-sm"
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
