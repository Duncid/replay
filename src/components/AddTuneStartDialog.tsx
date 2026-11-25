import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Upload } from "lucide-react";

interface ScoreSourceLink {
  label: string;
  href: string;
}

interface ScoreSource {
  name: string;
  home: string;
  /** Why this source is worth a look, in one line. */
  role: string;
  links: ScoreSourceLink[];
  detail: string;
}

/** Where students go looking for a score to bring in. */
export const SCORE_SOURCES: ScoreSource[] = [
  {
    name: "Noctave",
    home: "https://noctavepiano.com/en/",
    role: "Best for an initial curated catalogue",
    links: [
      { label: "Beginner piano scores", href: "https://noctavepiano.com/en/sheet-music/#band-easy" },
      { label: "Additional free library — 882 pieces", href: "https://noctavepiano.com/en/free-library/" },
    ],
    detail: "Free downloads, difficulty ratings, simplified arrangements and explicit licensing information.",
  },
  {
    name: "MuseScore",
    home: "https://musescore.com/",
    role: "Best for musical diversity",
    links: [
      { label: "Beginner piano, free downloads", href: "https://musescore.com/sheetmusic/beginner/piano" },
      { label: "PianoXML collection", href: "https://musescore.com/user/9292486" },
    ],
    detail: "Add the “To modify commercially” licence filter: the licence and free-download availability are separate things.",
  },
  {
    name: "OpenSongs",
    home: "https://be.creativeranges.org/library/sheets",
    role: "Interesting for traditional, folk and gospel music",
    links: [
      { label: "Example: When the Saints Go Marching In", href: "https://be.creativeranges.org/library/sheets/when-the-saints-go-marching-in-opensongs" },
    ],
    detail: "Public-domain sheets, each downloadable as MusicXML.",
  },
];

/** First screen of the add-a-tune flow: what to upload, where to find it, then the picker. */
export function AddTuneStartDialog({ open, onOpenChange, onPickFile }: { open: boolean; onOpenChange: (open: boolean) => void; onPickFile: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
            <div className="divide-y divide-border">
              {SCORE_SOURCES.map((source) => (
                <div key={source.name} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <a href={source.home} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4 hover:text-primary">
                      {source.name}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                    <span className="text-xs text-muted-foreground">{source.role}</span>
                  </div>
                  <ul className="space-y-1">
                    {source.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm underline underline-offset-4 hover:text-primary">
                          {link.label}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{source.detail}</p>
                </div>
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
