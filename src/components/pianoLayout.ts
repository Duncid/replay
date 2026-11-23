export type NoteActivity = "user" | "ai" | undefined;
export interface PianoNote {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
  midi: number;
  whiteIndex: number;
}
export interface PianoLayout {
  notes: PianoNote[];
  whiteKeys: PianoNote[];
  blackKeys: PianoNote[];
}
export function createPianoLayout(fullKeyboard: boolean): PianoLayout {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const notes: PianoNote[] = [];
  let whites = 0;
  for (let midi = fullKeyboard ? 21 : 48; midi <= (fullKeyboard ? 108 : 84); midi++) {
    const note = names[midi % 12], isBlack = note.includes("#");
    notes.push({ note, octave: Math.floor(midi / 12) - 1, frequency: 440 * Math.pow(2, (midi - 69) / 12),
      isBlack, midi, whiteIndex: whites });
    if (!isBlack) whites++;
  }
  return { notes, whiteKeys: notes.filter(n => !n.isBlack), blackKeys: notes.filter(n => n.isBlack) };
}

/** Pixel geometry shared by highway, rail and keys, including their gaps. */
export function pianoKeyGeometry(layout: PianoLayout, width: number, note: PianoNote) {
  const whiteWidth = (width - (layout.whiteKeys.length - 1)) / layout.whiteKeys.length;
  const { midi, whiteIndex: before } = note;
  return { midi, x: note.isBlack ? before * (whiteWidth + 1) - .5 - whiteWidth * .29 : before * (whiteWidth + 1), width: note.isBlack ? whiteWidth * .58 : whiteWidth };
}
/** Same geometry expressed in CSS so resize never waits for a React render. */
export function pianoKeyStyle(layout: PianoLayout, note: PianoNote) {
  const count = layout.whiteKeys.length;
  const white = `(100% - ${count - 1}px) / ${count}`;
  const before = note.whiteIndex;
  return { position: "absolute" as const,
    left: note.isBlack ? `calc(${before} * ((${white}) + 1px) - .5px - (${white}) * .29)` : `calc(${before} * ((${white}) + 1px))`,
    width: `calc((${white}) * ${note.isBlack ? .58 : 1})` };
}
