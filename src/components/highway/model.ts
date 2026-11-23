export type HighwayNote = {
  id: string; midi: number; start: number; duration: number;
  who: "user" | "ai";
  judgment?: "perfect" | "early" | "late" | "miss";
  label?: string;
  /** Beat of the judgment event; omitted for deterministic fixtures. */
  judgmentBeat?: number;
};
export type HighwayTransport = {
  getBeat: () => number;
  getState: () => "playing" | "waiting" | "paused";
  resetId: string | number;
  getArmed?: () => ReadonlySet<string>;
  getActive?: () => ReadonlySet<string>;
};
/** A waiting gate remains armed at (and slightly beyond) the hit line. */
export function nextHighwayNotes(notes: readonly HighwayNote[], beat: number, waiting: boolean) {
  const next = notes.find(n => n.who === "user" && !n.judgment && n.start >= beat - (waiting ? .02 : 0));
  return next ? notes.filter(n => n.who === "user" && !n.judgment && Math.abs(n.start - next.start) < .001) : [];
}
export function highwayState(note: HighwayNote, beat: number, armed: boolean, active = false) {
  if (note.judgment === "miss") return "miss";
  if (beat >= note.start && beat < note.start + note.duration && (note.who === "ai" || !!note.judgment || active)) return "sounding";
  if (armed && note.who === "user") return "next";
  return note.who === "ai" ? "bot" : "upcoming";
}
