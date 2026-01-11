import { NoteSequence, Note, DEFAULT_QPM } from "@/types/noteSequence";

// MIDI note number constants
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Convert note name (e.g., "C4", "F#5") to MIDI pitch number
 */
export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G]#?)(\d)$/);
  if (!match) throw new Error(`Invalid note name: ${noteName}`);
  
  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr);
  const noteIndex = NOTE_NAMES.indexOf(note);
  
  if (noteIndex === -1) throw new Error(`Invalid note: ${note}`);
  
  // MIDI note number: C4 = 60
  return (octave + 1) * 12 + noteIndex;
}

/**
 * Convert MIDI pitch number to note name (e.g., 60 -> "C4")
 */
export function midiToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const noteIndex = pitch % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Calculate frequency from MIDI pitch number
 */
export function midiToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/**
 * Convert beats to seconds given a tempo (QPM)
 */
export function beatsToSeconds(beats: number, qpm: number = DEFAULT_QPM): number {
  return (beats * 60) / qpm;
}

/**
 * Convert seconds to beats given a tempo (QPM)
 */
export function secondsToBeats(seconds: number, qpm: number = DEFAULT_QPM): number {
  return (seconds * qpm) / 60;
}

/**
 * Calculate beat timing relative to metronome using Tone.js timeline
 * @param toneTime - Tone.now() value when the event occurred
 * @param metronomeStartTime - Tone.now() value when metronome started
 * @param bpm - Beats per minute
 * @param timeSignature - Time signature string (e.g., "4/4")
 * @returns Beat number (1-indexed) and offset in seconds, or null if invalid
 */
export function calculateMetronomeBeatTiming(
  toneTime: number,
  metronomeStartTime: number,
  bpm: number,
  timeSignature: string
): { beat: number; beatOffset: number } | null {
  const elapsedTime = toneTime - metronomeStartTime;
  if (elapsedTime < 0) return null; // Before metronome started

  const beatDuration = 60 / bpm;
  const [numerator] = timeSignature.split("/").map(Number);
  const beatsPerBar = numerator;
  const barDuration = beatDuration * beatsPerBar;

  const timeWithinBar = elapsedTime % barDuration;
  const beat = Math.floor(timeWithinBar / beatDuration) + 1; // 1-indexed
  const exactBeatTime = (beat - 1) * beatDuration;
  const beatOffset = timeWithinBar - exactBeatTime;

  return { beat, beatOffset };
}

/**
 * Create an empty NoteSequence with default tempo
 */
export function createEmptyNoteSequence(qpm: number = DEFAULT_QPM, timeSignature = "4/4"): NoteSequence {
  const [numerator, denominator] = timeSignature.split("/").map(Number);
  
  return {
    notes: [],
    totalTime: 0,
    tempos: [{ time: 0, qpm }],
    timeSignatures: [{ time: 0, numerator, denominator }],
  };
}

/**
 * Add a note to a NoteSequence (returns a new sequence)
 */
export function addNote(
  sequence: NoteSequence,
  pitch: number,
  startTime: number,
  endTime: number,
  velocity: number = 0.8
): NoteSequence {
  const newNote: Note = { pitch, startTime, endTime, velocity };
  const notes = [...sequence.notes, newNote];
  const totalTime = Math.max(sequence.totalTime, endTime);
  
  return { ...sequence, notes, totalTime };
}

/**
 * Convert NoteSequence to ABC notation for sheet music display
 */
export function noteSequenceToAbc(sequence: NoteSequence, title?: string): string {
  if (sequence.notes.length === 0) return "";
  
  const qpm = sequence.tempos?.[0]?.qpm ?? DEFAULT_QPM;
  
  // ABC header - title is optional
  let abc = `X:1\n${title ? `T:${title}\n` : ""}M:4/4\nL:1/4\nK:C\n`;

  // Group notes by start time to identify chords
  const notesByStartTime = new Map<number, Note[]>();
  sequence.notes.forEach(note => {
    // Round to nearest 0.001 to handle floating point
    const key = Math.round(note.startTime * 1000);
    if (!notesByStartTime.has(key)) {
      notesByStartTime.set(key, []);
    }
    notesByStartTime.get(key)!.push(note);
  });
  
  // Sort by start time
  const sortedKeys = Array.from(notesByStartTime.keys()).sort((a, b) => a - b);
  
  // Convert each group to ABC notation
  const abcElements: string[] = [];
  
  sortedKeys.forEach(key => {
    const notes = notesByStartTime.get(key)!;
    
    if (notes.length === 1) {
      // Single note
      const note = notes[0];
      abcElements.push(noteToAbcString(note, qpm));
    } else {
      // Chord - use the shortest duration among the notes
      const minDuration = Math.min(...notes.map(n => n.endTime - n.startTime));
      const durationInBeats = secondsToBeats(minDuration, qpm);
      const abcChord = "[" + notes.map(n => pitchToAbcNote(n.pitch)).join("") + "]";
      abcElements.push(abcChord + getDurationString(durationInBeats));
    }
  });
  
  abc += abcElements.join(" ");
  return abc;
}

function noteToAbcString(note: Note, qpm: number): string {
  const abcNote = pitchToAbcNote(note.pitch);
  const durationInBeats = secondsToBeats(note.endTime - note.startTime, qpm);
  return abcNote + getDurationString(durationInBeats);
}

function pitchToAbcNote(pitch: number): string {
  const noteName = midiToNoteName(pitch);
  const note = noteName.slice(0, -1); // e.g., "C#"
  const octave = parseInt(noteName.slice(-1)); // e.g., 4
  
  // Convert to ABC notation
  let abcNote = note.replace("#", "^").replace("b", "_");
  
  if (octave === 3) {
    abcNote = abcNote.toUpperCase() + ",";
  } else if (octave === 4) {
    abcNote = abcNote.toUpperCase();
  } else if (octave === 5) {
    abcNote = abcNote.toLowerCase();
  } else if (octave === 6) {
    abcNote = abcNote.toLowerCase() + "'";
  }
  
  return abcNote;
}

function getDurationString(durationInBeats: number): string {
  // Round to nearest standard duration using midpoint thresholds
  // Support for common note durations: /4, /2, quarter, half, whole, double whole
  if (durationInBeats < 0.375) return "/4"; // sixteenth note (0.25 beats)
  if (durationInBeats < 0.75) return "/2"; // eighth note (0.5 beats)
  if (durationInBeats < 1.5) return ""; // quarter note (1 beat, default in ABC)
  if (durationInBeats < 3) return "2"; // half note (2 beats)
  if (durationInBeats < 6) return "4"; // whole note (4 beats)
  return "8"; // double whole (8 beats)
}

/**
 * Validate that a pitch is within the valid piano range (C3-C6)
 */
export function isValidPitch(pitch: number): boolean {
  // C3 = 48, C6 = 84
  return pitch >= 48 && pitch <= 84;
}

/**
 * Validate a NoteSequence
 */
export function validateNoteSequence(sequence: NoteSequence): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  sequence.notes.forEach((note, i) => {
    if (!isValidPitch(note.pitch)) {
      errors.push(`Note ${i}: pitch ${note.pitch} (${midiToNoteName(note.pitch)}) is outside valid range C3-C6`);
    }
    if (note.startTime < 0) {
      errors.push(`Note ${i}: negative startTime ${note.startTime}`);
    }
    if (note.endTime <= note.startTime) {
      errors.push(`Note ${i}: endTime (${note.endTime}) must be greater than startTime (${note.startTime})`);
    }
    if (note.velocity < 0 || note.velocity > 1) {
      errors.push(`Note ${i}: velocity ${note.velocity} must be between 0 and 1`);
    }
  });
  
  return { valid: errors.length === 0, errors };
}

/**
 * Parse ABC notation back to NoteSequence
 * Handles both full ABC with headers and simple note-only input like:
 * E E G E | C C C/2 D/2 E/2 z/ | E E G E | A,2
 */
export function abcToNoteSequence(abc: string, qpm: number = DEFAULT_QPM): NoteSequence {
  const sequence = createEmptyNoteSequence(qpm);
  
  // Check if input has ABC headers
  const lines = abc.split("\n");
  const headerPattern = /^[A-Z]:/;
  const hasHeaders = lines.some(line => headerPattern.test(line.trim()));

  let noteLine: string;
  if (hasHeaders) {
    // Filter out header lines and join the rest
    const noteLines = lines.filter(line => {
      const trimmed = line.trim();
      // Keep non-empty lines that don't start with header pattern
      return trimmed.length > 0 && !headerPattern.test(trimmed);
    });
    noteLine = noteLines.join(' ');
  } else {
    // Treat entire input as notes
    noteLine = abc;
  }
  
  // Remove bar lines, ties (~), and normalize whitespace
  noteLine = noteLine
    .replace(/\|/g, ' ')
    .replace(/~/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!noteLine) return sequence;
  
  // Tokenize: match notes, chords, and rests
  // Pattern matches: [chord], rest (z with optional duration), or note with accidentals/octave/duration
  const tokenPattern = /(\[[^\]]+\](?:\/?\d*|\/)?)|([zZ](?:\d+|\/\d*|\/)?)|([_^]?[A-Ga-g][,']*)(\d+|\/\d*|\/)?/g;
  
  let currentTime = 0;
  let match;
  
  while ((match = tokenPattern.exec(noteLine)) !== null) {
    const [, chord, rest, note, duration] = match;
    
    if (chord) {
      // Chord: [CEG]2, [CEG]/2, [CEG]
      const chordMatch = chord.match(/^\[([^\]]+)\](\/?\d*|\/)?$/);
      if (!chordMatch) continue;
      
      const [, chordNotes, durationStr] = chordMatch;
      const durationBeats = parseDuration(durationStr || "");
      const durationSeconds = beatsToSeconds(durationBeats, qpm);
      
      // Parse individual notes in chord
      const notePattern = /([_^]?)([A-Ga-g])([,']*)/g;
      let noteMatch;
      while ((noteMatch = notePattern.exec(chordNotes)) !== null) {
        const [, accidental, noteLetter, octaveMarkers] = noteMatch;
        const pitch = abcNoteToPitch(accidental, noteLetter, octaveMarkers);
        sequence.notes.push({
          pitch,
          startTime: currentTime,
          endTime: currentTime + durationSeconds,
          velocity: 0.8,
        });
      }
      
      currentTime += durationSeconds;
    } else if (rest) {
      // Rest: z, z2, z/2, z/
      const restDuration = rest.slice(1) || ""; // Remove the 'z'
      const durationBeats = parseDuration(restDuration);
      const durationSeconds = beatsToSeconds(durationBeats, qpm);
      currentTime += durationSeconds;
    } else if (note) {
      // Single note: E, E2, E/2, E/, ^E, _E, e, e', E,, A,2
      const noteMatch = note.match(/^([_^]?)([A-Ga-g])([,']*)$/);
      if (!noteMatch) continue;
      
      const [, accidental, noteLetter, octaveMarkers] = noteMatch;
      const durationBeats = parseDuration(duration || "");
      const durationSeconds = beatsToSeconds(durationBeats, qpm);
      const pitch = abcNoteToPitch(accidental, noteLetter, octaveMarkers);
      
      sequence.notes.push({
        pitch,
        startTime: currentTime,
        endTime: currentTime + durationSeconds,
        velocity: 0.8,
      });
      
      currentTime += durationSeconds;
    }
  }
  
  sequence.totalTime = currentTime;
  return sequence;
}

type Music21Runtime = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pyodide: any;
};

let music21RuntimePromise: Promise<Music21Runtime> | null = null;

const PYODIDE_VERSION = "v0.25.1";
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

async function loadMusic21Runtime(): Promise<Music21Runtime> {
  if (!music21RuntimePromise) {
    music21RuntimePromise = (async () => {
      const pyodideModule = await import(
        /* @vite-ignore */
        `${PYODIDE_BASE_URL}pyodide.mjs`
      );
      const loadPyodide =
        typeof pyodideModule.loadPyodide === "function"
          ? pyodideModule.loadPyodide
          : typeof pyodideModule.default?.loadPyodide === "function"
            ? pyodideModule.default.loadPyodide
            : typeof globalThis.loadPyodide === "function"
              ? globalThis.loadPyodide
              : null;

      if (!loadPyodide) {
        throw new Error("Pyodide runtime could not be loaded.");
      }

      const pyodide = await loadPyodide({
        indexURL: PYODIDE_BASE_URL,
      });
      await pyodide.loadPackage("micropip");
      await pyodide.runPythonAsync(`
import micropip
await micropip.install("music21")
      `);
      return { pyodide };
    })();
  }

  return music21RuntimePromise;
}

export async function musicXmlToNoteSequence(
  xmlText: string,
  options: { defaultQpm?: number; defaultVelocity?: number; mergeTies?: boolean } = {}
): Promise<NoteSequence> {
  const { defaultQpm = DEFAULT_QPM, defaultVelocity = 0.8, mergeTies = true } = options;
  const { pyodide } = await loadMusic21Runtime();

  if (!window.mm?.midiToSequenceProto) {
    throw new Error("Magenta MIDI conversion is unavailable.");
  }

  pyodide.globals.set("xml_text", xmlText);
  pyodide.globals.set("merge_ties", mergeTies);

  const midiBase64 = await pyodide.runPythonAsync(`
import base64
from music21 import converter, midi

score = converter.parse(xml_text)
if merge_ties:
    score = score.stripTies()

midi_file = midi.translate.streamToMidiFile(score)
midi_bytes = midi_file.writestr()
base64.b64encode(midi_bytes).decode("utf-8")
  `);

  const binaryString = atob(midiBase64 as string);
  const midiData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    midiData[i] = binaryString.charCodeAt(i);
  }

  const sequence = window.mm.midiToSequenceProto(midiData) as NoteSequence;

  const normalizeVelocity = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return defaultVelocity;
    const normalized = value > 1 ? value / 127 : value;
    return Math.min(1, Math.max(0, normalized));
  };

  const notes = (sequence.notes ?? []).map((note) => {
    const startTime = Number(Number(note.startTime).toFixed(6));
    const endTime = Number(Number(note.endTime).toFixed(6));
    const safeEnd = endTime <= startTime ? startTime + 0.01 : endTime;
    const velocity = normalizeVelocity(note.velocity ?? defaultVelocity);

    return {
      ...note,
      startTime,
      endTime: Number(safeEnd.toFixed(6)),
      velocity: Number(velocity.toFixed(3)),
    };
  });

  const totalTime =
    sequence.totalTime && sequence.totalTime > 0
      ? sequence.totalTime
      : notes.reduce((max, note) => Math.max(max, note.endTime), 0);

  return {
    ...sequence,
    notes,
    totalTime: Number(Number(totalTime).toFixed(6)),
    tempos: sequence.tempos?.length ? sequence.tempos : [{ time: 0, qpm: defaultQpm }],
    timeSignatures: sequence.timeSignatures?.length
      ? sequence.timeSignatures
      : [{ time: 0, numerator: 4, denominator: 4 }],
  };
}

function abcNoteToPitch(accidental: string, noteLetter: string, octaveMarkers: string): number {
  let noteName = noteLetter.toUpperCase();
  if (accidental === "^") noteName += "#";
  if (accidental === "_") noteName += "b";
  
  // Base octave: uppercase = 4, lowercase = 5
  let octave = noteLetter === noteLetter.toUpperCase() ? 4 : 5;
  
  // Adjust for octave markers: , = down, ' = up
  for (const marker of octaveMarkers) {
    if (marker === ",") octave--;
    else if (marker === "'") octave++;
  }
  
  // Handle flats by converting to equivalent sharp
  if (noteName.endsWith("b")) {
    const baseNote = noteName.charAt(0);
    const noteIndex = NOTE_NAMES.indexOf(baseNote);
    const flatIndex = (noteIndex - 1 + 12) % 12;
    noteName = NOTE_NAMES[flatIndex];
  }
  
  return noteNameToMidi(`${noteName}${octave}`);
}

function parseDuration(durationStr: string): number {
  if (!durationStr || durationStr === "") return 1; // default quarter note
  if (durationStr === "/") return 0.5; // shorthand for /2
  if (durationStr === "/2") return 0.5;
  if (durationStr === "/4") return 0.25;
  if (durationStr === "2") return 2;
  if (durationStr === "3") return 3;
  if (durationStr === "4") return 4;
  if (durationStr === "8") return 8;
  
  // Handle other fractions like /3, /8
  const fractionMatch = durationStr.match(/^\/(\d+)$/);
  if (fractionMatch) {
    return 1 / parseInt(fractionMatch[1]);
  }
  
  // Handle other multipliers
  const multiplierMatch = durationStr.match(/^(\d+)$/);
  if (multiplierMatch) {
    return parseInt(multiplierMatch[1]);
  }
  
  return 1; // fallback to quarter note
}
