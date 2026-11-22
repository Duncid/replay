export type NoteActivity = "user" | "ai" | undefined;
export interface PianoNote {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
  /** Existing black-key grid placement, shared with the rail. */
  gridColumn?: number;
}
export interface PianoLayout {
  notes: PianoNote[];
  whiteKeys: PianoNote[];
  blackKeys: PianoNote[];
  whiteGrid: string;
  blackGrid: string;
}
export function createPianoLayout(fullKeyboard: boolean): PianoLayout {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const notes: PianoNote[] = [];
  let whites = 0;
  for (let midi = fullKeyboard ? 21 : 48; midi <= (fullKeyboard ? 108 : 84); midi++) {
    const note = names[midi % 12], isBlack = note.includes("#");
    notes.push({ note, octave: Math.floor(midi / 12) - 1, frequency: 440 * Math.pow(2, (midi - 69) / 12),
      isBlack, gridColumn: isBlack ? whites * 2 : undefined });
    if (!isBlack) whites++;
  }
  return { notes, whiteKeys: notes.filter(n => !n.isBlack), blackKeys: notes.filter(n => n.isBlack),
    whiteGrid: fullKeyboard ? "grid-cols-52" : "grid-cols-22",
    blackGrid: fullKeyboard ? "grid-cols-104" : "grid-cols-44" };
}
