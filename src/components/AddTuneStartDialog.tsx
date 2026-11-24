import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Upload } from "lucide-react";

/** Where students go looking for a score to bring in. */
export const MUSESCORE_URL = "https://musescore.com/";

interface AddTuneStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the file picker; the dialog stays open until a file actually arrives. */
  onPickFile: () => void;
}

/** First screen of the add-a-tune flow: what to upload, where to find it, then the picker. */
export function AddTuneStartDialog({ open, onOpenChange, onPickFile }: AddTuneStartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a tune</DialogTitle>
          <DialogDescription>Bring a piano score and we&rsquo;ll turn it into a practice tune.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-lg border border-border p-3 text-sm">
            Upload a <span className="font-medium">.mxl</span> file — compressed MusicXML, the sheet-music format
            that keeps every note readable. Piano solos work best.
          </p>

          <p className="rounded-lg border border-border p-3 text-sm">
            No file yet?{" "}
            <a href={MUSESCORE_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:text-primary">
              MuseScore
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>{" "}
            is one of the world&rsquo;s largest free sheet-music libraries — millions of scores you can listen to,
            then download as .mxl.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onPickFile}>
            <Upload className="size-4" aria-hidden="true" />
            Choose a .mxl file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
