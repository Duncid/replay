import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { abcToNoteSequence, midiToFrequency } from "@/utils/noteSequenceUtils";
import { NoteSequence } from "@/types/noteSequence";
import { useToast } from "@/hooks/use-toast";
import { SheetMusic } from "@/components/SheetMusic";
import { usePianoAudio } from "@/hooks/usePianoAudio";
import { PianoSoundType } from "@/hooks/usePianoSound";

interface AddPartitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sequence: NoteSequence) => void;
  bpm: number;
  initialAbc?: string;
  mode?: 'add' | 'edit';
  onEdit?: (sequence: NoteSequence) => void;
  instrument?: PianoSoundType;
}

// Helper function to strip ABC headers and return only notes
function stripAbcHeaders(abc: string): string {
  const lines = abc.split("\n");
  const headerPattern = /^[A-Z]:/;
  const noteLines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !headerPattern.test(trimmed);
  });
  return noteLines.join("\n");
}

export function AddPartitionDialog({ open, onOpenChange, onAdd, bpm, initialAbc, mode = 'add', onEdit, instrument = 'acoustic-piano' }: AddPartitionDialogProps) {
  const [abcText, setAbcText] = useState(initialAbc ? stripAbcHeaders(initialAbc) : "");
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const { toast } = useToast();
  // Only create audio engine when dialog is open to avoid background classic engine interference
  const audio = usePianoAudio(open ? instrument : null);
  const { ensureAudioReady, playNote } = audio;

  // Update abcText when dialog opens with initialAbc (edit mode)
  useEffect(() => {
    if (open && initialAbc) {
      setAbcText(stripAbcHeaders(initialAbc));
    }
  }, [open, initialAbc]);

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
        await new Promise((resolve) => setTimeout(resolve, delay));
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
      await new Promise((resolve) => setTimeout(resolve, lastNoteDuration));
    }

    setIsPlaying(false);
  }, [previewSequence, ensureAudioReady, playNote]);

  const handleStop = useCallback(() => {
    playbackRef.current.cancelled = true;
    setIsPlaying(false);
  }, []);

  const handleSubmit = () => {
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

      if (mode === 'edit' && onEdit) {
        onEdit(sequence);
        toast({ title: "Recording updated" });
      } else {
        onAdd(sequence);
        toast({ title: "Partition added" });
      }

      setAbcText("");
      onOpenChange(false);
    } catch (error) {
      console.error("ABC parsing error:", error);
      toast({
        title: "Invalid ABC notation",
        description: error instanceof Error ? error.message : "Unable to parse ABC",
        variant: "destructive"
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && mode === 'add') {
      setAbcText("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {mode === 'edit' ? 'Edit Recording' : 'Add Partition'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 flex flex-col space-y-4 py-4 overflow-y-auto min-h-0">
          {previewSequence && (
            <div className="space-y-2 flex-shrink-0">
              <Button variant="outline" className="gap-2" onClick={isPlaying ? handleStop : handlePlay}>
                {isPlaying ? (
                  <>
                    <Square className="h-4 w-4" fill="currentColor" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" fill="currentColor" />
                    Play
                  </>
                )}
              </Button>
              <div className="flex items-start gap-2">
                <div className="overflow-x-auto flex-1">
                  <SheetMusic sequence={previewSequence} compact noControls noTitle />
                </div>
              </div>
            </div>
          )}
          <Textarea
            placeholder="E E G E | C C C/2 D/2 E/2 z/ | E E G E | A,2"
            value={abcText}
            onChange={(e) => setAbcText(e.target.value)}
            className="flex-1 min-h-[200px] font-mono text-sm border-none border-top border-bottom rounded-none"
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
