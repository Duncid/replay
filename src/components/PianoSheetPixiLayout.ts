import { midiToNoteName } from "@/utils/noteSequenceUtils";

export type Accidental = "sharp" | "flat" | "natural" | null;

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
  staffLineGap: number;
  staffTopY: number;
  leftPadding: number;
  rightPadding: number;
  viewWidth: number;
  viewHeight: number;
  minNoteWidth: number;
  midiRef: number;
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

export function computeLayout(notes: NoteEvent[], config: SheetConfig) {
  const staffBottomLineY = config.staffTopY + 4 * config.staffLineGap;
  // Each semitone moves one staff step (line/space).
  const staffStepSize = config.staffLineGap / 2;
  let maxEnd = 0;

  const noteRects: NoteRect[] = notes.map((note) => {
    const end = note.start + note.dur;
    maxEnd = Math.max(maxEnd, end);

    const staffStep = note.midi - config.midiRef;
    const y = staffBottomLineY - staffStep * staffStepSize;
    const width = Math.max(config.minNoteWidth, note.dur * config.pixelsPerUnit);
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

  return { contentWidth, noteRects };
}
