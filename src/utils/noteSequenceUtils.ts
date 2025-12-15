import { NoteSequence, Note, DEFAULT_QPM } from "@/types/noteSequence";

// MIDI note number constants
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Convert note name (e.g., "C4", "F#5") to MIDI pitch number
 */
export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-Ga-g])([#b]?)(\d)$/);
  if (!match) throw new Error(`Invalid note name: ${noteName}`);

  const [, noteLetterRaw, accidental, octaveStr] = match;
  const noteLetter = noteLetterRaw.toUpperCase();
  const baseOffset = NOTE_OFFSETS[noteLetter];

  if (baseOffset === undefined) throw new Error(`Invalid note: ${noteLetter}`);

  let semitone = baseOffset + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  let octave = parseInt(octaveStr);

  // Wrap accidentals that cross octave boundaries, e.g., B# -> C of next octave
  while (semitone < 0) {
    semitone += 12;
    octave -= 1;
  }
  while (semitone >= 12) {
    semitone -= 12;
    octave += 1;
  }

  // MIDI note number: C4 = 60
  return (octave + 1) * 12 + semitone;
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
  const qpm = sequence.tempos?.[0]?.qpm ?? DEFAULT_QPM;
  const epsilon = 1e-6;

  // Ignore notes with zero or negative duration to avoid emitting empty ABC bodies
  const validNotes = sequence.notes.filter(n => n.endTime - n.startTime > epsilon);
  if (validNotes.length === 0) return "";

  // ABC header - title is optional
  let abc = `X:1\n${title ? `T:${title}\n` : ""}M:4/4\nL:1/4\nK:C\n`;

  // Build a timeline of all start/end points to preserve overlapping durations
  const timePoints = new Set<number>([0]);
  validNotes.forEach(note => {
    timePoints.add(note.startTime);
    timePoints.add(note.endTime);
  });

  const sortedTimes = Array.from(timePoints).sort((a, b) => a - b);
  const abcElements: string[] = [];

  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const start = sortedTimes[i];
    const end = sortedTimes[i + 1];
    const durationSeconds = end - start;

    if (durationSeconds <= 0) continue;

    const activeNotes = validNotes.filter(
      n => n.startTime <= start + epsilon && n.endTime > start + epsilon
    );

    const durationInBeats = secondsToBeats(durationSeconds, qpm);
    if (activeNotes.length === 0) {
      // Rest segment
      abcElements.push("z" + getDurationString(durationInBeats));
    } else if (activeNotes.length === 1) {
      // Single active note during this slice
      const abcNote = pitchToAbcNote(activeNotes[0].pitch);
      abcElements.push(abcNote + getDurationString(durationInBeats));
    } else {
      // Multiple notes sounding together
      const chordNotes = activeNotes.map(n => pitchToAbcNote(n.pitch)).join("");
      abcElements.push("[" + chordNotes + "]" + getDurationString(durationInBeats));
    }
  }

  if (abcElements.length === 0) {
    // Fallback to a simpler grouping approach if slicing somehow produced nothing
    const grouped = groupNotesByStart(validNotes);
    const groupedElements = grouped.map(notes => {
      if (notes.length === 1) {
        const note = notes[0];
        const durationInBeats = secondsToBeats(note.endTime - note.startTime, qpm);
        return pitchToAbcNote(note.pitch) + getDurationString(durationInBeats);
      }

      const minDuration = Math.min(...notes.map(n => n.endTime - n.startTime));
      const durationInBeats = secondsToBeats(minDuration, qpm);
      return "[" + notes.map(n => pitchToAbcNote(n.pitch)).join("") + "]" + getDurationString(durationInBeats);
    });

    abc += groupedElements.join(" ");
  } else {
    abc += abcElements.join(" ");
  }
  return abc;
}

function groupNotesByStart(notes: Note[]): Note[][] {
  const byStart = new Map<number, Note[]>();

  notes.forEach(note => {
    const key = Math.round(note.startTime * 1000);
    const bucket = byStart.get(key);
    if (bucket) {
      bucket.push(note);
    } else {
      byStart.set(key, [note]);
    }
  });

  return Array.from(byStart.keys())
    .sort((a, b) => a - b)
    .map(key => byStart.get(key) ?? []);
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

  // Merge consecutive segments for the same pitch to restore sustained notes
  sequence.notes = mergeConsecutiveNotes(sequence.notes);
  sequence.totalTime = currentTime;
  return sequence;
}

function mergeConsecutiveNotes(notes: Note[]): Note[] {
  if (notes.length === 0) return notes;

  // Sort by pitch then start time
  const sorted = [...notes].sort((a, b) =>
    a.pitch === b.pitch ? a.startTime - b.startTime : a.pitch - b.pitch
  );

  const merged: Note[] = [];
  const epsilon = 1e-6;

  sorted.forEach(note => {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.pitch === note.pitch &&
      Math.abs(last.endTime - note.startTime) < epsilon &&
      Math.abs(last.velocity - note.velocity) < epsilon
    ) {
      last.endTime = Math.max(last.endTime, note.endTime);
    } else {
      merged.push({ ...note });
    }
  });

  return merged;
}

function abcNoteToPitch(accidental: string, noteLetter: string, octaveMarkers: string): number {
  const accidentalSymbol = accidental === "^" ? "#" : accidental === "_" ? "b" : "";
  const noteName = `${noteLetter.toUpperCase()}${accidentalSymbol}`;

  // Base octave: uppercase = 4, lowercase = 5
  let octave = noteLetter === noteLetter.toUpperCase() ? 4 : 5;

  // Adjust for octave markers: , = down, ' = up
  for (const marker of octaveMarkers) {
    if (marker === ",") octave--;
    else if (marker === "'") octave++;
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
