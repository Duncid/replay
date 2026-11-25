import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import musescoreLogo from "@/assets/musescore-logo.svg.asset.json";

interface ScoreSource {
  name: string;
  home: string;
  logo: string;
  /** What the source is good for, in one line. */
  description: string;
}

/** Where students go looking for a score to bring in. */
export const SCORE_SOURCES: ScoreSource[] = [
  {
    name: "Noctave",
    home: "https://noctavepiano.com/en/",
    logo: "/logos/noctave.jpg",
    description: "Best for an initial curated catalogue: free downloads, difficulty ratings, simplified arrangements and explicit licensing information.",
  },
  {
    name: "MuseScore",
    home: "https://musescore.com/",
    logo: musescoreLogo.url,
    description: "Best for musical diversity. Add the “To modify commercially” licence filter: the licence and free-download availability are separate things.",
  },
  {
    name: "OpenSongs",
    home: "https://be.creativeranges.org/library/sheets",
    logo: "/logos/opensongs.jpg",
    description: "Interesting for traditional, folk and gospel music: public-domain sheets, each downloadable as MusicXML.",
  },
];

/** First screen of the add-a-tune flow: what to upload, where to find it, then the picker. */
export function AddTuneStartDialog({ open, onOpenChange, onPickFile }: { open: boolean; onOpenChange: (open: boolean) => void; onPickFile: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a tune</DialogTitle>
          <DialogDescription>Bring a piano score and we&rsquo;ll turn it into a practice tune.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Upload a .mxl file
            </h3>
            <p className="text-sm">
              Compressed MusicXML, the sheet-music format that keeps every note readable. Piano solos work best.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">No file yet?</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SCORE_SOURCES.map((source) => (
                <a
                  key={source.name}
                  href={source.home}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-sm"
                >
                  <img src={source.logo} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  <span className="block text-sm font-semibold">{source.name}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{source.description}</span>
                </a>
              ))}
            </div>
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
