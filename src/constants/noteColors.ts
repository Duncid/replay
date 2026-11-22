import palettes from "@/design-system/palettes.json";

export type NoteLetter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type ReplayTheme = keyof typeof palettes;
export const getReplayTheme = (): ReplayTheme => {
  const theme = typeof document === "undefined" ? "acid" : document.documentElement.dataset.theme;
  return theme === "amber" || theme === "hotwire" ? theme : "acid";
};
export function getNotePalette(theme: ReplayTheme = getReplayTheme()): Record<NoteLetter, string> {
  const colors = palettes[theme];
  return { C: colors["note-c"], D: colors["note-d"], E: colors["note-e"], F: colors["note-f"],
    G: colors["note-g"], A: colors["note-a"], B: colors["note-b"] };
}
export const getBaseNoteLetter = (noteName: string): NoteLetter | null => {
  const base = noteName.replace(/[0-9#]/g, "");
  return /^[CDEFGAB]$/.test(base) ? base as NoteLetter : null;
};
export const getNoteColorForNoteName = (noteName: string): string | undefined => {
  const base = getBaseNoteLetter(noteName);
  return base ? getNotePalette()[base] : undefined;
};
export const getNoteColorsForNoteName = (noteName: string): { idle: string; active: string; focused: string } | undefined => {
  const base = getBaseNoteLetter(noteName);
  if (!base) return undefined;
  const colors: Record<string, string> = palettes[getReplayTheme()];
  const key = `note-${base.toLowerCase()}`;
  return { idle: colors[key], active: colors[`${key}-active`], focused: colors[`${key}-focused`] };
};
