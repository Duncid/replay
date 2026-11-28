import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Upload } from "lucide-react";
import musescoreLogo from "@/assets/musescore-logo.svg.asset.json";

interface ScoreSource {
  name: string;
  home: string;
  logo: string;
  /** What the source is good for, in one line. */
  descriptionKey: string;
}

/** Where students go looking for a score to bring in. */
export const SCORE_SOURCES: ScoreSource[] = [
  {
    name: "Noctave",
    home: "https://noctavepiano.com/en/",
    logo: "/logos/noctave.jpg",
    descriptionKey: "upload.noctave",
  },
  {
    name: "MuseScore",
    home: "https://musescore.com/",
    logo: musescoreLogo.url,
    descriptionKey: "upload.musescore",
  },
  {
    name: "OpenSongs",
    home: "https://be.creativeranges.org/library/sheets",
    logo: "/logos/opensongs.jpg",
    descriptionKey: "upload.opensongs",
  },
];

/** First screen of the add-a-tune flow: what to upload, where to find it, then the picker. */
export function AddTuneStartDialog({ open, onOpenChange, onPickFile, hiddenTunes = [], onAddBack }: {
  open: boolean; onOpenChange: (open: boolean) => void; onPickFile: () => void;
  /** Noodlyn tunes this account removed from its list. */
  hiddenTunes?: { tune_key: string; title?: string | null; composer?: string | null }[];
  onAddBack?: (tuneKey: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("library.add")}</DialogTitle>
          <DialogDescription>{t("upload.intro")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("upload.formatTitle")}
            </h3>
            <p className="text-sm">
              {t("upload.formatHelp")}
            </p>
          </div>

          {hiddenTunes.length > 0 && onAddBack && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("upload.hidden")}</h3>
              <ul className="flex flex-wrap gap-2">
                {hiddenTunes.map((tune) => (
                  <li key={tune.tune_key}>
                    <Button variant="outline" size="sm" onClick={() => onAddBack(tune.tune_key)} aria-label={t("upload.addBack", { title: tune.title || tune.tune_key })}>
                      <Plus className="size-4" aria-hidden="true" />
                      {tune.title || tune.tune_key}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("upload.sources")}</h3>
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
                  <span className="block text-xs leading-snug text-muted-foreground">{t(source.descriptionKey)}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onPickFile}>
            <Upload className="size-4" aria-hidden="true" />
            {t("upload.choose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
