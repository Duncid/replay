import type { TuneCarouselItem } from "@/components/TuneCarousel";
import { getTunePreview } from "@/utils/tunePreview";

// Deterministic musical sample for documentation only; production uses published assets.
export const tuneCardPreview = getTunePreview({
  notes: [60, 64, 67, 72, 71, 67, 65, 64, 62, 67, 64, 60, 62, 60].map((pitch, index) => ({
    pitch, startTime: index * 0.5, endTime: index * 0.5 + (index % 4 === 3 ? 0.75 : 0.4),
  })),
  totalTime: 7,
});

export const tuneCarouselItems: TuneCarouselItem[] = [
  { tune_key: "intro", unlocked: true, acquired: true, preview: tuneCardPreview, prerequisites: [] },
  { tune_key: "st-louis-blues", unlocked: true, preview: tuneCardPreview, prerequisites: [] },
  { tune_key: "autumn-leaves", unlocked: false, preview: tuneCardPreview, prerequisites: ["st-louis-blues"] },
];
