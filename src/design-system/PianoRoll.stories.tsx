import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useRef, useState } from "react";
import { PianoSheetPixi } from "@/components/PianoSheetPixi";
import type { NoteEvent } from "@/components/PianoSheetPixiLayout";

// A short melody (seconds at 120 bpm) covering naturals and sharps.
const MELODY: Array<[number, number]> = [
  [60, 0.5], [62, 0.5], [64, 0.5], [65, 0.5], [67, 1], [66, 0.5], [69, 0.5],
  [67, 1], [64, 0.5], [63, 0.5], [62, 0.5], [61, 0.5], [60, 1.5], [72, 0.5],
];
let t = 0;
const NOTES: NoteEvent[] = MELODY.map(([midi, dur], i) => {
  const note = { id: `n${i}`, midi, start: t, dur };
  t += dur;
  return note;
});
const TOTAL = t;

function InteractiveRoll({ playing, width, height }: { playing: boolean; width: number; height: number }) {
  const onTickRef = useRef<((timeSec: number) => void) | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const origin = performance.now() - now * 1000;
    const loop = () => {
      const sec = ((performance.now() - origin) / 1000) % (TOTAL + 1);
      onTickRef.current?.(sec);
      setNow(sec);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const active = useMemo(() => new Set(NOTES.filter(n => now >= n.start && now < n.start + n.dur).map(n => n.id)), [now]);
  const focused = useMemo(() => {
    const next = NOTES.find(n => n.start >= now);
    return new Set(next ? [next.id] : []);
  }, [now]);
  return (
    <div className="rounded-lg border bg-background" style={{ width, height }}>
      <PianoSheetPixi notes={NOTES} width={width} height={height} qpm={120} onTickRef={onTickRef}
        activeNoteIds={active} focusedNoteIds={focused} followPlayhead isAutoplay={playing} />
    </div>
  );
}

const meta = {
  title: "Instruments/Interactive notes",
  component: InteractiveRoll,
  args: { playing: true, width: 900, height: 320 },
  parameters: { docs: { description: { component: "The interactive piano-roll used in Tune Practice: solid pitch-colored notes, moving playhead, active (sounding) and focused (next) notes. Toggle `playing` to pause." } } },
} satisfies Meta<typeof InteractiveRoll>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playing: Story = {};
export const Paused: Story = { args: { playing: false } };
