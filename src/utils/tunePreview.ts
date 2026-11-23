export interface TunePreview {
  notes: { pitch: number; startTime: number; endTime: number }[];
  noteCount: number;
  duration: number;
}

/** Keep library rendering small; never hand full sequences to the thumbnail. */
export function getTunePreview(sequence: unknown): TunePreview | undefined {
  if (!sequence || typeof sequence !== "object" || !("notes" in sequence) || !Array.isArray(sequence.notes)) return undefined;
  const notes: TunePreview["notes"] = [];
  let noteCount = 0;
  let duration = 0;
  for (const note of sequence.notes) {
    if (!note || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
      || !Number.isFinite(note.startTime) || !Number.isFinite(note.endTime)
      || note.startTime < 0 || note.endTime <= note.startTime) continue;
    noteCount++;
    duration = Math.max(duration, note.endTime);
    if (notes.length < 14) notes.push({ pitch: note.pitch, startTime: note.startTime, endTime: note.endTime });
  }
  if (!noteCount) return undefined;
  if ("totalTime" in sequence && typeof sequence.totalTime === "number" && Number.isFinite(sequence.totalTime)) {
    duration = Math.max(duration, sequence.totalTime);
  }
  return { notes, noteCount, duration };
}

export function tuneDisplayTitle(key: string): string {
  return key.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
