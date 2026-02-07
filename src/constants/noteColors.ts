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

export const NOTE_COLOR_SHADES: Record<
  NoteLetter,
  { 300: string; 400: string; 500: string }
> = {
  C: { 300: "#eda6a6", 400: "#ea7474", 500: "#E24A4A" },
  D: { 300: "#f3ca95", 400: "#f1a65e", 500: "#F08A3C" },
  E: { 300: "#fff674", 400: "#ffe256", 500: "#F2C94C" },
  F: { 300: "#ade1b9", 400: "#7ad08d", 500: "#58BC6E" },
  G: { 300: "#4de1f5", 400: "#24c9df", 500: "#1FA4B6" },
  A: { 300: "#95b6da", 400: "#6298d8", 500: "#3A78D4" },
  B: { 300: "#b1a4df", 400: "#957bdc", 500: "#7A4DD8" },
};

export const getNoteColorsForNoteName = (
  noteName: string
): { idle: string; active: string; focused: string } | undefined => {
  const base = getBaseNoteLetter(noteName);
  if (!base) return undefined;
  const shades = NOTE_COLOR_SHADES[base];
  return { idle: shades[500], active: shades[400], focused: shades[300] };
};
