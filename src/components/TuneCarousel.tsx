import { Plus } from "lucide-react";
import { TuneCard } from "@/components/TuneCard";
import { BuildingTuneCard } from "@/components/BuildingTuneCard";
import type { TuneBuild } from "@/hooks/useActiveTuneBuilds";
import { tuneDisplayTitle, type TunePreview } from "@/utils/tunePreview";

export interface TuneCarouselItem {
  tune_key: string;
  title?: string | null;
  composer?: string | null;
  unlocked: boolean;
  prerequisites: string[];
  preview?: TunePreview;
}

export interface TuneCarouselProps {
  tunes: TuneCarouselItem[];
  onSelectTune: (key: string) => void;
  /** Signed-in users can upload a tune; the CTA sits last, smaller and muted. */
  onAddTune?: () => void;
  /** Uploads still building, shown after the tunes. */
  builds?: TuneBuild[];
  onRetryBuild?: (id: string) => void;
  onDismissBuild?: (id: string) => void;
}

/** Native horizontal scrolling and centered snap points; selection uses asset keys. */
export function TuneCarousel({ tunes, onSelectTune, onAddTune, builds = [], onRetryBuild, onDismissBuild }: TuneCarouselProps) {
  return <ul aria-label="Tunes" tabIndex={0}
    className="flex gap-4 overflow-x-auto snap-x snap-mandatory py-4 px-[calc(50%-8rem)] sm:px-[calc(50%-9rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-1 focus-visible:outline-ring focus-visible:outline-offset-[-1px]">
    {tunes.map(tune => (
      <li key={tune.tune_key} className="snap-center shrink-0 w-64 sm:w-72">
        <TuneCard title={tune.title?.trim() || tuneDisplayTitle(tune.tune_key)} composer={tune.composer} unlocked={tune.unlocked}
          preview={tune.preview} prerequisites={tune.prerequisites.map(tuneDisplayTitle)}
          onSelect={() => onSelectTune(tune.tune_key)} />
      </li>
    ))}
    {builds.filter(b => !tunes.some(t => t.tune_key === b.tune_key) || b.status !== "succeeded").map(b => (
      <li key={b.id} className="snap-center shrink-0 w-64 sm:w-72">
        <BuildingTuneCard title={b.title?.trim() || tuneDisplayTitle(b.tune_key)} composer={b.composer} failed={b.status === "failed"}
          error={b.error} progress={b.progress} onRetry={onRetryBuild && (() => onRetryBuild(b.id))} onDismiss={onDismissBuild && (() => onDismissBuild(b.id))} />
      </li>
    ))}
    {onAddTune && (
      <li className="snap-center shrink-0 self-center">
        <button type="button" onClick={onAddTune} aria-label="Add a tune"
          className="flex size-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-muted-foreground/70 transition-colors hover:border-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none">
          <Plus aria-hidden="true" className="size-5" />
          <span className="text-[11px] font-medium">Add a tune</span>
        </button>
      </li>
    )}
  </ul>;
}
