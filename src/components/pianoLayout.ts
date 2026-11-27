export type NoteActivity = "user" | "ai" | undefined;
export type PianoRange = readonly [number, number];
export interface PianoNote {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
  midi: number;
  whiteIndex: number;
  segment: number;
}
export interface PianoLayout {
  notes: PianoNote[];
  whiteKeys: PianoNote[];
  blackKeys: PianoNote[];
  ranges: readonly PianoRange[];
  /** Minimum canvas width relative to its viewport; >1 enables scrolling. */
  widthScale: number;
}
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const PIANO_BREAK_UNITS = .65;
const MIN_KEY_SCALE = .75;
const isWhite = (midi: number) => !names[midi % 12].includes("#");
/** Width is the visible keyboard viewport, in CSS pixels, after padding. */
export function defaultWhiteKeyCount(width?: number): number {
  if (width === undefined || !Number.isFinite(width) || width <= 0 || width >= 1150) return 22;
  if (width >= 900) return 18;
  if (width >= 734) return 15;
  return Math.max(8, Math.min(15, Math.floor((width + 1) / 49)));
}

export function createPianoLayout(fullKeyboard: boolean, width?: number): PianoLayout {
  return fullKeyboard ? layoutForRanges([[21, 108]]) : createAdaptivePianoLayout([], width);
}

function layoutForRanges(ranges: readonly PianoRange[]): PianoLayout {
  const notes: PianoNote[] = [];
  let whites = 0;
  ranges.forEach(([low, high], segment) => {
    for (let midi = low; midi <= high; midi++) {
      const note = names[midi % 12], isBlack = !isWhite(midi);
      notes.push({ note, octave: Math.floor(midi / 12) - 1, frequency: 440 * Math.pow(2, (midi - 69) / 12),
        isBlack, midi, whiteIndex: whites, segment });
      if (!isBlack) whites++;
    }
  });
  return { notes, whiteKeys: notes.filter(n => !n.isBlack), blackKeys: notes.filter(n => n.isBlack), ranges, widthScale: 1 };
}

/** Deterministic scope-wide layout: never depends on playhead, velocity, or played notes. */
export function createAdaptivePianoLayout(pitches: readonly number[], width?: number): PianoLayout {
  const target = defaultWhiteKeyCount(width);
  const used = [...new Set(pitches.filter(p => Number.isInteger(p) && p >= 0 && p <= 127))].sort((a, b) => a - b);
  if (target === 22 && (!used.length || (used[0] >= 48 && used.at(-1)! <= 84))) return layoutForRanges([[48, 84]]);
  const low = used[0] ?? 66, high = used.at(-1) ?? 66;
  // Keep ordinary piano limits unless the music needs valid MIDI notes beyond them.
  const floor = Math.min(21, Math.floor(low / 12) * 12);
  const ceiling = Math.max(108, Math.min(127, Math.ceil(high / 12) * 12));
  const whites = Array.from({ length: ceiling - floor + 1 }, (_, i) => floor + i).filter(isWhite);
  type Candidate = { range: PianoRange; count: number; padding: number; distance: number };
  const candidates = (min: number, max: number): Candidate[] => {
    const first = whites.findLastIndex(p => p <= min), last = whites.findIndex(p => p >= max);
    const result: Candidate[] = [];
    for (let start = 0; start <= first; start++) {
      for (let end = last; end < whites.length; end++) {
        result.push({ range: [whites[start], whites[end]], count: end - start + 1,
          padding: Math.abs((first - start) - (end - last)), distance: Math.abs(whites[start] + whites[end] - 132) });
      }
    }
    return result;
  };
  const continuous = candidates(low, high).filter(c => c.count >= target)
    .sort((a, b) => a.count - b.count || a.padding - b.padding || a.distance - b.distance || a.range[0] - b.range[0])[0];
  const viewport = width && Number.isFinite(width) && width > 0 ? width : 1200;
  const keyWidth = (count: number, split = false) => (viewport - count + 1) / (count + (split ? PIANO_BREAK_UNITS : 0));
  if (keyWidth(continuous.count) >= keyWidth(target) * MIN_KEY_SCALE) return layoutForRanges([continuous.range]);

  type Split = { ranges: PianoRange[]; count: number; balance: number; distance: number };
  const compare = (a: Split, b: Split) => a.count - b.count || a.balance - b.balance || a.distance - b.distance
    || a.ranges[0][0] - b.ranges[0][0] || a.ranges[0][1] - b.ranges[0][1] || a.ranges[1][0] - b.ranges[1][0];
  let best: Split | undefined;
  for (let i = 1; i < used.length; i++) {
    // Only omit a gap containing a complete unused C–B octave.
    if (Math.ceil((used[i - 1] + 1) / 12) * 12 + 11 >= used[i]) continue;
    const lefts = candidates(low, used[i - 1]).filter(c => c.range[1] < used[i]);
    const rights = candidates(used[i], high).filter(c => c.range[0] > used[i - 1]);
    for (const left of lefts) {
      for (const right of rights) {
        const count = left.count + right.count;
        if (count < target || (best && count > best.count)) continue;
        if (Math.ceil((left.range[1] + 1) / 12) * 12 + 11 >= right.range[0]) continue;
        if (keyWidth(count, true) < keyWidth(continuous.count) * 1.2) continue;
        const split = { ranges: [left.range, right.range], count, balance: Math.abs(left.count - right.count),
          distance: Math.abs(left.range[0] - 48) + Math.abs(right.range[1] - 84) };
        if (!best || compare(split, best) < 0) best = split;
      }
    }
  }
  // Required notes always stay on screen, even when their keys must be narrow.
  return layoutForRanges(best ? best.ranges : [continuous.range]);
}

export const pianoLayoutKey = (layout: PianoLayout) => layout.ranges.map(r => r.join(":")).join("|");
const units = (layout: PianoLayout) => layout.whiteKeys.length + (layout.ranges.length - 1) * PIANO_BREAK_UNITS;

/** Pixel geometry shared by highway, rail and keys, including their gaps. */
export function pianoKeyGeometry(layout: PianoLayout, width: number, note: PianoNote) {
  const whiteWidth = (width - (layout.whiteKeys.length - 1)) / units(layout);
  const { midi, whiteIndex: before, segment } = note;
  const x = before * (whiteWidth + 1) + segment * PIANO_BREAK_UNITS * whiteWidth;
  return { midi, x: note.isBlack ? x - .5 - whiteWidth * .29 : x, width: note.isBlack ? whiteWidth * .58 : whiteWidth };
}
const whiteCss = (layout: PianoLayout) => `(100% - ${layout.whiteKeys.length - 1}px) / ${units(layout)}`;
/** Same geometry expressed in CSS so resize never waits for a React render. */
export function pianoKeyStyle(layout: PianoLayout, note: PianoNote) {
  const white = whiteCss(layout);
  const x = `${note.whiteIndex} * ((${white}) + 1px) + ${note.segment * PIANO_BREAK_UNITS} * (${white})`;
  return { position: "absolute" as const,
    left: note.isBlack ? `calc(${x} - .5px - (${white}) * .29)` : `calc(${x})`,
    width: `calc((${white}) * ${note.isBlack ? .58 : 1})` };
}
export function pianoBreaks(layout: PianoLayout) {
  return layout.whiteKeys.filter(n => n.segment > 0 && n.midi === layout.ranges[n.segment][0]);
}
export function pianoBreakStyle(layout: PianoLayout, start: PianoNote) {
  const white = whiteCss(layout);
  return { left: `calc(${start.whiteIndex} * ((${white}) + 1px) + ${(start.segment - 1) * PIANO_BREAK_UNITS} * (${white}))`, width: `calc(${PIANO_BREAK_UNITS} * (${white}))` };
}
export function pianoBreakGeometry(layout: PianoLayout, width: number, start: PianoNote) {
  const white = (width - (layout.whiteKeys.length - 1)) / units(layout);
  return { x: pianoKeyGeometry(layout, width, start).x - PIANO_BREAK_UNITS * white, width: PIANO_BREAK_UNITS * white };
}

export function pianoCanvasMinWidth(layout: PianoLayout) {
  return layout.widthScale > 1
    ? `calc(${layout.widthScale * 100}% + ${layout.whiteKeys.length - 1 - layout.widthScale * 21}px)` : "100%";
}
