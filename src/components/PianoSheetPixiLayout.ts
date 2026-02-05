import { midiToNoteName } from "@/utils/noteSequenceUtils";

export type Accidental = "sharp" | "flat" | "natural" | null;

const NOTE_LETTER_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

function midiToDiatonicIndex(midi: number) {
  const noteName = midiToNoteName(midi);
  const letter = noteName[0];
  const octave = parseInt(noteName.slice(-1), 10);
  const letterIndex = NOTE_LETTER_INDEX[letter] ?? 0;
  return octave * 7 + letterIndex;
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
  staffLineGap: number;
  staffTopY: number;
  bassStaffGap: number;
  leftPadding: number;
  rightPadding: number;
  viewWidth: number;
  viewHeight: number;
  minNoteWidth: number;
  trebleMidiRef: number;
  bassMidiRef: number;
  twoStaffThresholdMidi: number;
}

export interface NoteRect {
  id: string;
  midi: number;
  x: number;
  y: number;
  width: number;
  height: number;
  accidental: Accidental;
  staff: "treble" | "bass";
  staffStep: number;
  ledgerLines: number[];
}

export function computeLayout(notes: NoteEvent[], config: SheetConfig) {
  // Each semitone moves one staff step (line/space).
  const staffStepSize = config.staffLineGap / 2;
  const trebleTopLineY = config.staffTopY;
  const trebleBottomLineY = trebleTopLineY + 4 * config.staffLineGap;
  const hasBassStaff = notes.some(
    (note) => note.midi < config.twoStaffThresholdMidi
  );
  const bassTopLineY = hasBassStaff
    ? trebleBottomLineY + config.bassStaffGap
    : null;
  const bassBottomLineY =
    bassTopLineY !== null ? bassTopLineY + 4 * config.staffLineGap : null;
  let maxEnd = 0;

  const noteRects: NoteRect[] = notes.map((note) => {
    const end = note.start + note.dur;
    maxEnd = Math.max(maxEnd, end);

    const staff: "treble" | "bass" =
      hasBassStaff && note.midi < config.twoStaffThresholdMidi
        ? "bass"
        : "treble";
    const staffStep =
      staff === "treble"
        ? midiToDiatonicIndex(note.midi) -
          midiToDiatonicIndex(config.trebleMidiRef)
        : midiToDiatonicIndex(note.midi) -
          midiToDiatonicIndex(config.bassMidiRef);
    const staffBottomLineY =
      staff === "treble"
        ? trebleBottomLineY
        : bassBottomLineY ?? trebleBottomLineY;
    const y = staffBottomLineY - staffStep * staffStepSize;
    const width = Math.max(
      config.minNoteWidth,
      note.dur * config.pixelsPerUnit
    );
    const x = config.leftPadding + note.start * config.pixelsPerUnit;

    const noteName = midiToNoteName(note.midi);
    const inferredAccidental = noteName.includes("#") ? "sharp" : null;

    const ledgerLines: number[] = [];

    return {
      id: note.id,
      midi: note.midi,
      x,
      y,
      width,
      height: config.noteHeight,
      accidental: note.accidental ?? inferredAccidental,
      staff,
      staffStep,
      ledgerLines,
    };
  });

  const contentWidth =
    config.leftPadding + maxEnd * config.pixelsPerUnit + config.rightPadding;

  const trebleLines = Array.from({ length: 5 }, (_, index) => {
    return trebleTopLineY + index * config.staffLineGap;
  });
  const bassLines =
    bassTopLineY !== null
      ? Array.from({ length: 5 }, (_, index) => {
          return bassTopLineY + index * config.staffLineGap;
        })
      : null;

  const classicSteps = [0, 2, 4, 6, 8];
  const trebleSteps = noteRects
    .filter((note) => note.staff === "treble")
    .map((note) => note.staffStep);
  const trebleMinStep = Math.min(0, ...trebleSteps, 8);
  const trebleMaxStep = Math.max(8, ...trebleSteps, 0);
  const trebleStart =
    trebleMinStep % 2 === 0 ? trebleMinStep : trebleMinStep - 1;
  const trebleEnd = trebleMaxStep % 2 === 0 ? trebleMaxStep : trebleMaxStep + 1;
  const trebleExtended = Array.from(
    { length: Math.floor((trebleEnd - trebleStart) / 2) + 1 },
    (_, index) => trebleBottomLineY - (trebleStart + index * 2) * staffStepSize
  );
  const trebleLineSet = new Set(trebleLines);
  const trebleLedger = trebleExtended.filter(
    (line) => !trebleLineSet.has(line)
  );

  const bassExtended =
    bassBottomLineY !== null && bassTopLineY !== null
      ? (() => {
          const bassSteps = noteRects
            .filter((note) => note.staff === "bass")
            .map((note) => note.staffStep);
          const bassMinStep = Math.min(0, ...bassSteps, 8);
          const bassMaxStep = Math.max(8, ...bassSteps, 0);
          const bassStart =
            bassMinStep % 2 === 0 ? bassMinStep : bassMinStep - 1;
          const bassEnd = bassMaxStep % 2 === 0 ? bassMaxStep : bassMaxStep + 1;
          return Array.from(
            { length: Math.floor((bassEnd - bassStart) / 2) + 1 },
            (_, index) =>
              bassBottomLineY - (bassStart + index * 2) * staffStepSize
          );
        })()
      : null;
  const bassLedger =
    bassLines && bassExtended
      ? (() => {
          const bassLineSet = new Set(bassLines);
          return bassExtended.filter((line) => !bassLineSet.has(line));
        })()
      : null;

  return {
    contentWidth,
    noteRects,
    staffLines: {
      treble: {
        classic: trebleLines,
        ledger: trebleLedger,
        classicSteps,
      },
      bass: bassLines
        ? {
            classic: bassLines,
            ledger: bassLedger ?? [],
            classicSteps,
          }
        : null,
    },
    hasBassStaff,
  };
}
