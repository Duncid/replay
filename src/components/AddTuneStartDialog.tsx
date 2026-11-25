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
  logo: string;
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
    logo: "/logos/noctave.jpg",
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
    logo: "/logos/musescore.png",
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
    logo: "/logos/opensongs.jpg",
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
                <div key={source.name} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                  <a href={source.home} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg transition-colors hover:text-primary">
                    <img src={source.logo} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{source.name}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">{source.role}</span>
                    </span>
                  </a>
                  <div className="flex flex-col gap-1.5">
                    {source.links.map((link) => (
                      <Button key={link.href} asChild variant="secondary" size="sm" className="h-auto justify-between whitespace-normal py-1.5 text-left text-xs">
                        <a href={link.href} target="_blank" rel="noopener noreferrer">
                          {link.label}
                          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                        </a>
                      </Button>
                    ))}
                  </div>
                  <p className="mt-auto text-xs text-muted-foreground">{source.detail}</p>
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
