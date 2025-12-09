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
  // Round to nearest standard duration
  if (durationInBeats <= 0.375) return "/2"; // sixteenth/eighth
  if (durationInBeats <= 0.75) return ""; // quarter (default)
  if (durationInBeats <= 1.5) return "2"; // half
  if (durationInBeats <= 3) return "4"; // whole
  return "8"; // double whole
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
 * Parse ABC notation back to NoteSequence (for compatibility)
 */
export function abcToNoteSequence(abc: string, qpm: number = DEFAULT_QPM): NoteSequence {
  const sequence = createEmptyNoteSequence(qpm);
  
  // Extract the note line (after the headers)
  const lines = abc.split("\n");
  const noteLineIndex = lines.findIndex(line => line.match(/^[\[A-Ga-g^_,'/\d\s\]]+$/));
  if (noteLineIndex === -1) return sequence;
  
  const noteLine = lines[noteLineIndex];
  const abcElements = noteLine.trim().split(/\s+/);
  
  let currentTime = 0;
  
  for (const element of abcElements) {
    if (!element) continue;
    
    if (element.startsWith("[")) {
      // Chord
      const chordMatch = element.match(/^\[([^\]]+)\](\/?\d*)$/);
      if (!chordMatch) continue;
      
      const [, chordNotes, durationStr] = chordMatch;
      const durationBeats = parseDuration(durationStr);
      const durationSeconds = beatsToSeconds(durationBeats, qpm);
      
      const noteMatches = chordNotes.matchAll(/([_^]?)([A-Ga-g])([,']*)/g);
      for (const match of noteMatches) {
        const [, accidental, noteLetter, octaveMarkers] = match;
        const pitch = abcNoteToPitch(accidental, noteLetter, octaveMarkers);
        sequence.notes.push({
          pitch,
          startTime: currentTime,
          endTime: currentTime + durationSeconds,
          velocity: 0.8,
        });
      }
      
      currentTime += durationSeconds;
    } else {
      // Single note
      const match = element.match(/^([_^]?)([A-Ga-g])([,']*)(\/?\d*)$/);
      if (!match) continue;
      
      const [, accidental, noteLetter, octaveMarkers, durationStr] = match;
      const durationBeats = parseDuration(durationStr);
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

function abcNoteToPitch(accidental: string, noteLetter: string, octaveMarkers: string): number {
  let noteName = noteLetter.toUpperCase();
  if (accidental === "^") noteName += "#";
  
  let octave = 4;
  if (noteLetter === noteLetter.toUpperCase()) {
    octave = octaveMarkers === "," ? 3 : 4;
  } else {
    octave = octaveMarkers === "'" ? 6 : 5;
  }
  
  return noteNameToMidi(`${noteName}${octave}`);
}

function parseDuration(durationStr: string): number {
  if (durationStr === "/2") return 0.25;
  if (durationStr === "2") return 1.0;
  if (durationStr === "4") return 2.0;
  if (durationStr === "8") return 4.0;
  return 0.5; // default quarter note
}
