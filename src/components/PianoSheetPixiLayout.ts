import { DEFAULT_QPM, DEFAULT_TIME_SIGNATURE, type TimeSignature } from "@/types/noteSequence";
import { midiToNoteName } from "@/utils/noteSequenceUtils";

export type Accidental = "sharp" | "flat" | "natural" | null;

const BLACK_KEY_STEPS = new Set([1, 3, 6, 8, 10]);

function isBlackKey(midi: number) {
  return BLACK_KEY_STEPS.has(midi % 12);
}

export interface NoteEvent {
  id: string;
  midi: number;
  start: number;
  dur: number;
  accidental?: Accidental;
}

export interface SheetConfig {
  pixelsPerUnit: number;
  noteHeight: number;
  noteCornerRadius: number;
  trackGap: number;
  trackTopY: number;
  leftPadding: number;
  rightPadding: number;
  viewWidth: number;
  viewHeight: number;
  minNoteWidth: number;
}

export interface NoteRect {
  id: string;
  midi: number;
  x: number;
  y: number;
  width: number;
  height: number;
  accidental: Accidental;
}

export function computeLayout(
  notes: NoteEvent[],
  config: SheetConfig,
  timeSignatures: TimeSignature[] | undefined,
  qpm: number | undefined
) {
  const trackStep = config.noteHeight + config.trackGap;
  const minMidi = notes.length
    ? Math.min(...notes.map((note) => note.midi))
    : 0;
  const maxMidi = notes.length
    ? Math.max(...notes.map((note) => note.midi))
    : 0;
  let maxEnd = 0;

  const noteRects: NoteRect[] = notes.map((note) => {
    const end = note.start + note.dur;
    maxEnd = Math.max(maxEnd, end);

    const trackIndex = maxMidi - note.midi;
    const y =
      config.trackTopY + trackIndex * trackStep + config.noteHeight / 2;
    const width = Math.max(
      config.minNoteWidth,
      note.dur * config.pixelsPerUnit
    );
    const x = config.leftPadding + note.start * config.pixelsPerUnit;

    const noteName = midiToNoteName(note.midi);
    const inferredAccidental = noteName.includes("#") ? "sharp" : null;

    return {
      id: note.id,
      midi: note.midi,
      x,
      y,
      width,
      height: config.noteHeight,
      accidental: note.accidental ?? inferredAccidental,
    };
  });

  const contentWidth =
    config.leftPadding + maxEnd * config.pixelsPerUnit + config.rightPadding;

  const resolvedQpm = qpm ?? DEFAULT_QPM;
  const sortedTimeSignatures = (timeSignatures?.length
    ? [...timeSignatures]
    : [{ time: 0, ...DEFAULT_TIME_SIGNATURE }])
    .sort((a, b) => a.time - b.time);
  if (sortedTimeSignatures[0]?.time !== 0) {
    sortedTimeSignatures.unshift({
      time: 0,
      ...DEFAULT_TIME_SIGNATURE,
    });
  }

  const beatLines: number[] = [];
  const measureLines: number[] = [];

  for (let i = 0; i < sortedTimeSignatures.length; i += 1) {
    const signature = sortedTimeSignatures[i];
    const nextSignature = sortedTimeSignatures[i + 1];
    const segmentStart = signature.time;
    const segmentEnd = nextSignature ? nextSignature.time : maxEnd;
    if (segmentEnd < segmentStart) continue;

    const beatDuration = (60 / resolvedQpm) * (4 / signature.denominator);
    const beatsPerMeasure = signature.numerator;
    let beatIndex = 0;
    for (
      let time = segmentStart;
      time <= segmentEnd + 1e-6;
      time += beatDuration
    ) {
      const x = config.leftPadding + time * config.pixelsPerUnit;
      if (beatIndex % beatsPerMeasure === 0) {
        measureLines.push(x);
      } else {
        beatLines.push(x);
      }
      beatIndex += 1;
    }
  }

  const trackLines = Array.from(
    { length: maxMidi - minMidi + 1 },
    (_, index) => {
      const midi = maxMidi - index;
      return {
        y: config.trackTopY + index * trackStep,
        isBlack: isBlackKey(midi),
      };
    }
  );

  return {
    contentWidth,
    noteRects,
    trackLines,
    trackHeight: config.noteHeight,
    beatLines,
    measureLines,
  };
}
