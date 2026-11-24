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
const MIN_WHITE_KEYS = 22;
const MIN_KEY_SCALE = .75;
const isWhite = (midi: number) => !names[midi % 12].includes("#");
function whiteCount([low, high]: PianoRange) {
  let count = 0;
  for (let midi = low; midi <= high; midi++) if (isWhite(midi)) count++;
  return count;
}

export function createPianoLayout(fullKeyboard: boolean): PianoLayout {
  return layoutForRanges([fullKeyboard ? [21, 108] : [48, 84]]);
}

function layoutForRanges(ranges: readonly PianoRange[], scroll = false): PianoLayout {
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
  // Scrolling preserves 75% of the default key width; CSS adds the inter-key gaps.
  const widthScale = scroll ? Math.max(1, whites * MIN_KEY_SCALE / MIN_WHITE_KEYS) : 1;
  return { notes, whiteKeys: notes.filter(n => !n.isBlack), blackKeys: notes.filter(n => n.isBlack), ranges, widthScale };
}

/** Deterministic scope-wide layout: never depends on playhead, velocity, or played notes. */
export function createAdaptivePianoLayout(pitches: readonly number[]): PianoLayout {
  const used = [...new Set(pitches.filter(p => Number.isInteger(p) && p >= 0 && p <= 127))].sort((a, b) => a - b);
  if (!used.length || (used[0] >= 48 && used.at(-1)! <= 84)) return createPianoLayout(false);
  const low = used[0], high = used.at(-1)!;
  // Keep ordinary piano limits, extending only for valid MIDI notes beyond A0–C8.
  const floor = Math.min(21, Math.floor(low / 12) * 12), ceiling = Math.max(108, Math.min(127, Math.ceil(high / 12) * 12));
  const starts = Array.from({ length: ceiling - floor + 1 }, (_, i) => i + floor).filter(p => p === floor || p % 12 === 0);
  const ends = Array.from({ length: ceiling - floor + 1 }, (_, i) => i + floor).filter(p => p === ceiling || p % 12 === 0 || p % 12 === 11);
  const candidates = (min: number, max: number, split: boolean) => starts.flatMap(start => ends
    .filter(end => start <= min && end >= max && end > start && (split || end % 12 === 0 || end === ceiling))
    .map(end => [start, end] as PianoRange));
  const distance = (r: PianoRange) => Math.abs(r[0] - 48) + Math.abs(r[1] - 84);
  const continuous = candidates(low, high, false).filter(r => whiteCount(r) >= MIN_WHITE_KEYS)
    .sort((a, b) => whiteCount(a) - whiteCount(b) || distance(a) - distance(b) || a[0] - b[0])[0];
  const continuousCount = whiteCount(continuous);
  if (MIN_WHITE_KEYS / continuousCount >= MIN_KEY_SCALE) return layoutForRanges([continuous]);

  const splits: { ranges: PianoRange[]; count: number; balance: number; distance: number }[] = [];
  for (let i = 1; i < used.length; i++) {
    // A complete C–B octave must lie between the two occupied clusters.
    if (Math.ceil((used[i - 1] + 1) / 12) * 12 + 11 >= used[i]) continue;
    for (const left of candidates(low, used[i - 1], true)) {
      for (const right of candidates(used[i], high, true)) {
        if (Math.ceil((left[1] + 1) / 12) * 12 + 11 >= right[0]) continue;
        const a = whiteCount(left), b = whiteCount(right), count = a + b;
        if (count < MIN_WHITE_KEYS || MIN_WHITE_KEYS / (count + PIANO_BREAK_UNITS) < MIN_KEY_SCALE) continue;
        if (continuousCount / (count + PIANO_BREAK_UNITS) < 1.2) continue;
        splits.push({ ranges: [left, right], count, balance: Math.abs(a - b), distance: distance([left[0], right[1]]) });
      }
    }
  }
  splits.sort((a, b) => a.count - b.count || a.balance - b.balance || a.distance - b.distance || a.ranges[0][0] - b.ranges[0][0]);
  return splits.length ? layoutForRanges(splits[0].ranges) : layoutForRanges([continuous], true);
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
