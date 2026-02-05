export const NOTE_COLORS = {
  C: "#E24A4A",
  D: "#F08A3C",
  E: "#F2C94C",
  F: "#58BC6E",
  G: "#1FA4B6",
  A: "#3A78D4",
  B: "#7A4DD8",
} as const;

export type NoteLetter = keyof typeof NOTE_COLORS;

export const getBaseNoteLetter = (noteName: string): NoteLetter | null => {
  const base = noteName.replace(/[0-9]/g, "").replace("#", "");
  if (base in NOTE_COLORS) {
    return base as NoteLetter;
  }
  return null;
};

export const getNoteColorForNoteName = (noteName: string): string | undefined => {
  const base = getBaseNoteLetter(noteName);
  return base ? NOTE_COLORS[base] : undefined;
};
