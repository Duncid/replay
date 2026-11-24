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

        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Upload a .mxl file
            </h3>
            <p className="text-sm">
              Compressed MusicXML, the sheet-music format that keeps every note readable. Piano solos work best.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">No file yet?</h3>
            <p className="text-sm">
              <a href={MUSESCORE_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:text-primary">
                MuseScore
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>{" "}
              is one of the world&rsquo;s largest free sheet-music libraries — millions of scores, including hundreds
              of thousands free to download as .mxl.
            </p>
          </div>
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
