import score from "@/music/st-louis-blues/tune.inst1.ns.json";
import type { HighwayNote } from "@/components/highway/model";
import { getTunePlayback } from "@/utils/tunePreview";

export interface DemoTune {
  key: string; title: string; composer: string; bpm: number; beatsPerSecond: number; duration: number;
  notes: { id: string; midi: number; start: number; end: number; name: string }[];
  highwayNotes: HighwayNote[];
  range: [number, number];
}
export const formatDemoTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function makeDemoTune(key: string, title: string, composer: string, sequence: unknown): DemoTune | null {
  const playback = getTunePlayback(sequence);
  if (!playback) return null;
  const metadata = sequence as { tempos?: { qpm: number }[]; timeSignatures?: { numerator: number; denominator: number }[] };
  const qpm = metadata.tempos?.[0]?.qpm;
  const bpm = typeof qpm === "number" && Number.isFinite(qpm) && qpm > 0 ? qpm : 120;
  const beatsPerSecond = bpm / 60;
  const meter = metadata.timeSignatures?.at(-1);
  const beatsPerBar = meter && meter.numerator > 0 && meter.denominator > 0 ? meter.numerator * 4 / meter.denominator : 4;
  const barSeconds = beatsPerBar / beatsPerSecond;
  const duration = Math.ceil(playback.duration / barSeconds) * barSeconds;
  const notes = playback.notes.map((note, index) => ({
    id: String(index), midi: note.pitch, start: note.startTime, end: note.endTime,
    name: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][note.pitch % 12] + (Math.floor(note.pitch / 12) - 1),
  }));
  // Include the next repetition on approach before wrapping, preserving all tracks.
  const highwayNotes: HighwayNote[] = [0, 1].flatMap(cycle => notes.map(note => ({
    id: `${cycle}:${note.id}`, midi: note.midi, start: (note.start + cycle * duration) * beatsPerSecond,
    duration: (note.end - note.start) * beatsPerSecond, who: "user",
  })));
  const pitches = notes.map(note => note.midi);
  return { key, title, composer, bpm, beatsPerSecond, duration, notes, highwayNotes,
    range: [Math.min(...pitches), Math.max(...pitches)] };
}
export const initialDemoTune = makeDemoTune("st-louis-blues", "St Louis Blues", "W. C. Handy", score)!;
