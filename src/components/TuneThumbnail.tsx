import { Music2 } from "lucide-react";
import type { TunePreview } from "@/utils/tunePreview";

const pitchTokens = ["c", "c", "d", "d", "e", "f", "f", "g", "g", "a", "a", "b"];
const sharpIndices = new Set([1, 3, 6, 8, 10]);

/** Same darkening as the note rail: sharps mix 60% note color with the black-key color. */
const noteFill = (pitch: number) => {
  const index = pitch % 12;
  const base = `hsl(var(--note-${pitchTokens[index]}))`;
  return sharpIndices.has(index) ? `color-mix(in srgb, ${base} 60%, hsl(var(--key-black)))` : base;
};

/** Static, decorative equivalent of Replay Nat's six-lane tune preview. */
export function TuneThumbnail({ preview }: { preview?: TunePreview }) {
  const notes = preview?.notes ?? [];
  const low = Math.min(...notes.map(note => note.pitch));
  const high = Math.max(...notes.map(note => note.pitch));
  const start = Math.min(...notes.map(note => note.startTime));
  const duration = Math.max(1, ...notes.map(note => note.endTime - start));
  return <span aria-hidden="true" className="relative block h-[120px] w-full overflow-hidden">
    <svg viewBox="0 0 288 120" preserveAspectRatio="none" className="block size-full">
      {Array.from({ length: 6 }, (_, row) => <rect key={row} x={0} y={row * 20} width={288} height={19}
        fill={`hsl(var(--${row % 2 === 0 ? "surface-raised" : "card"}))`} />)}
      {notes.map((note, index) => <rect key={index}
        x={12 + (note.startTime - start) / duration * 264}
        y={12 + (high - note.pitch) / Math.max(1, high - low) * 88}
        width={Math.max(8, (note.endTime - note.startTime) / duration * 264 - 2)}
        height={8} rx={4} fill={noteFill(note.pitch)} />)}
    </svg>
    {!notes.length && <Music2 className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />}
  </span>;
}
