export type PianoSoundType =
  | "classic"        // Original raw Web Audio oscillators (DEFAULT)
  | "acoustic-piano" // tonejs-instruments sampled grand piano
  | "electric-piano" // tonejs-instruments electric piano
  | "guitar"         // tonejs-instruments acoustic guitar
  | "cello"          // tonejs-instruments cello
  | "bass"           // tonejs-instruments bass
  | "organ"          // tonejs-instruments organ
  | "trumpet"        // tonejs-instruments trumpet
  | "flute";         // tonejs-instruments flute

export const PIANO_SOUND_LABELS: Record<PianoSoundType, string> = {
  "classic": "Basic",
  "acoustic-piano": "Acoustic Piano",
  "electric-piano": "Electric Piano",
  "guitar": "Acoustic Guitar",
  "cello": "Cello",
  "bass": "Contrabass",
  "organ": "Organ",
  "trumpet": "Trumpet",
  "flute": "Flute",
};

export const SAMPLED_INSTRUMENTS: PianoSoundType[] = [
  "acoustic-piano",
  "electric-piano",
  "guitar",
  "cello",
  "bass",
  "organ",
  "trumpet",
  "flute",
];

// Map our sound types to tonejs-instruments folder names
export const INSTRUMENT_FOLDER_MAP: Record<string, string> = {
  "acoustic-piano": "piano",
  "electric-piano": "harmonium",
  "guitar": "guitar-acoustic",
  "cello": "cello",
  "bass": "contrabass",
  "organ": "organ",
  "trumpet": "trumpet",
  "flute": "flute",
};

export const INSTRUMENT_NOTE_RANGES: Record<PianoSoundType, { min: string; max: string }> = {
  classic: { min: "C0", max: "C8" },
  "acoustic-piano": { min: "A0", max: "C8" },
  "electric-piano": { min: "A0", max: "C8" },
  guitar: { min: "E3", max: "E6" },
  cello: { min: "C2", max: "C6" },
  bass: { min: "E1", max: "C5" },
  organ: { min: "C2", max: "C7" },
  trumpet: { min: "F#3", max: "D6" },
  flute: { min: "C4", max: "D7" },
};

// Sample notes to load for each instrument (sparse sampling)
export const SAMPLE_NOTES = [
  "A1", "C2", "D#2", "F#2", "A2", "C3", "D#3", "F#3",
  "A3", "C4", "D#4", "F#4", "A4", "C5", "D#5", "F#5",
  "A5", "C6", "D#6", "F#6", "A6", "C7"
];

export function getSamplerUrls(instrument: string): Record<string, string> {
  const folder = INSTRUMENT_FOLDER_MAP[instrument];
  if (!folder) return {};
  
  const urls: Record<string, string> = {};
  SAMPLE_NOTES.forEach(note => {
    // Convert note format: "D#4" -> "Ds4"
    const fileName = note.replace("#", "s");
    urls[note] = `${fileName}.mp3`;
  });
  return urls;
}

export function getSamplerBaseUrl(instrument: string): string {
  const folder = INSTRUMENT_FOLDER_MAP[instrument];
  return `https://nbrosowsky.github.io/tonejs-instruments/samples/${folder}/`;
}
