import { TuneCard } from "@/components/TuneCard";
import { tuneDisplayTitle, type TunePreview } from "@/utils/tunePreview";

export interface TuneCarouselItem {
  tune_key: string;
  unlocked: boolean;
  prerequisites: string[];
  acquired?: boolean;
  preview?: TunePreview;
}

export interface TuneCarouselProps {
  tunes: TuneCarouselItem[];
  onSelectTune: (key: string) => void;
}

/** Native horizontal scrolling and centered snap points; selection uses asset keys. */
export function TuneCarousel({ tunes, onSelectTune }: TuneCarouselProps) {
  return <ul aria-label="Tunes" tabIndex={0}
    className="flex gap-4 overflow-x-auto snap-x snap-mandatory py-4 px-[calc(50%-8rem)] sm:px-[calc(50%-9rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-1 focus-visible:outline-ring focus-visible:outline-offset-[-1px]">
    {tunes.map(tune => (
      <li key={tune.tune_key} className="snap-center shrink-0 w-64 sm:w-72">
        <TuneCard title={tuneDisplayTitle(tune.tune_key)} unlocked={tune.unlocked}
          acquired={tune.acquired} preview={tune.preview} prerequisites={tune.prerequisites.map(tuneDisplayTitle)}
          onSelect={() => onSelectTune(tune.tune_key)} />
      </li>
    ))}
  </ul>;
}
