import intro from "./intro/output/tune.ns.json";
import introXml from "./intro/output/tune.xml?raw";
import stLouis from "./st-louis-blues/tune.inst1.ns.json";
import { getTunePlayback, getTunePreview } from "@/utils/tunePreview";
import type { TuneCarouselItem } from "@/components/TuneCarousel";
import type { PracticePlanItem } from "@/types/tunePractice";

// Deliberate guest allowlist; no account/profile, publishing, or progression queries.
export const guestTunes: TuneCarouselItem[] = [
  { tune_key: "intro", title: "Intro", unlocked: true, prerequisites: [],
    preview: getTunePreview(intro), playback: getTunePlayback(intro) },
  { tune_key: "st-louis-blues", title: "St Louis Blues", composer: "W. C. Handy", unlocked: false, prerequisites: [],
    preview: getTunePreview(stLouis) },
];
export const guestIntroPlan: PracticePlanItem = {
  itemId: "intro-full", itemType: "full_tune", nugget: null, assembly: null, motifs: [],
  fullTune: { id: "intro-full", label: "Intro", noteSequence: intro },
  instruction: "Play Intro at your own pace. The music waits for the right notes. Use Replay to hear it first.",
};
export { intro as guestIntroSequence, introXml as guestIntroXml };
