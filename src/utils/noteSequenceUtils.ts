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

  // Quantize to a 16th-note grid to stabilize rhythmic spelling
  const stepsPerBeat = 4;
  const quantized = quantizeNotes(validNotes, qpm, stepsPerBeat);
  const segments = buildTimelineSegments(quantized);

  const abcElements: string[] = [];
  let currentStep = 0;

  segments.forEach(segment => {
    if (segment.startStep > currentStep) {
      const restBeats = (segment.startStep - currentStep) / stepsPerBeat;
      abcElements.push("z" + getDurationString(restBeats));
    }

    const durationBeats = (segment.endStep - segment.startStep) / stepsPerBeat;
    if (durationBeats <= epsilon) return;

    const pitches = segment.pitches.sort((a, b) => a - b);
    const chord = pitches.length > 1
      ? `[${pitches.map(pitchToAbcNote).join("")}]`
      : pitchToAbcNote(pitches[0]);

    abcElements.push(chord + getDurationString(durationBeats));
    currentStep = segment.endStep;
  });

  abc += abcElements.join(" ");
  return abc;
}

type QuantizedNote = Note & { startStep: number; endStep: number };

function quantizeNotes(notes: Note[], qpm: number, stepsPerBeat: number): QuantizedNote[] {
  return notes
    .map(note => {
      const startBeats = secondsToBeats(note.startTime, qpm);
      const endBeats = secondsToBeats(note.endTime, qpm);

      const startStep = Math.round(startBeats * stepsPerBeat);
      const endStep = Math.max(startStep + 1, Math.round(endBeats * stepsPerBeat));

      return { ...note, startStep, endStep };
    })
    .sort((a, b) => a.startStep - b.startStep || a.pitch - b.pitch);
}

function extractMelody(notes: QuantizedNote[], stepsPerBeat: number): QuantizedNote[] {
  if (notes.length === 0) return [];

  const groups = groupQuantizedByStart(notes);
  if (groups.length === 0) return [];

  const paths: { score: number; prevGroup: number | null; prevIndex: number | null }[][] = [];

  groups.forEach((group, groupIdx) => {
    paths[groupIdx] = group.map(candidate => {
      const localScore = scoreLocal(candidate, stepsPerBeat);

      if (groupIdx === 0) {
        return { score: localScore, prevGroup: null, prevIndex: null };
      }

      let bestScore = -Infinity;
      let bestPrevGroup: number | null = null;
      let bestPrevIndex: number | null = null;

      const prevCandidates = paths[groupIdx - 1];
      prevCandidates.forEach((prevPath, prevIdx) => {
        const prevNote = groups[groupIdx - 1][prevIdx];
        const transitionScore = scoreTransition(prevNote, candidate, stepsPerBeat);
        const candidateScore = prevPath.score + localScore + transitionScore;

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestPrevGroup = groupIdx - 1;
          bestPrevIndex = prevIdx;
        }
      });

      return { score: bestScore, prevGroup: bestPrevGroup, prevIndex: bestPrevIndex };
    });
  });

  // Backtrack to find the best path
  const lastGroup = paths[paths.length - 1];
  let bestFinalIdx = 0;
  lastGroup.forEach((candidate, idx) => {
    if (candidate.score > lastGroup[bestFinalIdx].score) bestFinalIdx = idx;
  });

  const melody: QuantizedNote[] = [];
  let currentGroup = paths.length - 1;
  let currentIdx: number | null = bestFinalIdx;

  while (currentIdx !== null && currentGroup >= 0) {
    melody.unshift(groups[currentGroup][currentIdx]);
    const prev = paths[currentGroup][currentIdx];
    currentIdx = prev.prevIndex;
    currentGroup = prev.prevGroup ?? -1;
  }

  return melody;
}

function groupQuantizedByStart(notes: QuantizedNote[]): QuantizedNote[][] {
  const grouped = new Map<number, QuantizedNote[]>();
  notes.forEach(note => {
    const bucket = grouped.get(note.startStep) ?? [];
    bucket.push(note);
    grouped.set(note.startStep, bucket);
  });

  return Array.from(grouped.keys())
    .sort((a, b) => a - b)
    .map(start => grouped.get(start)!.sort((a, b) => b.velocity - a.velocity || b.pitch - a.pitch));
}

function scoreLocal(note: QuantizedNote, stepsPerBeat: number): number {
  const durationSteps = Math.max(1, note.endStep - note.startStep);
  const durationBeats = durationSteps / stepsPerBeat;

  const durationScore = Math.log2(1 + durationBeats) * 0.8;
  const velocityScore = note.velocity * 0.6;
  const pitchScore = (note.pitch - 60) / 48; // prefer higher pitches gently

  const onBeat = note.startStep % stepsPerBeat === 0;
  const halfBeat = note.startStep % (stepsPerBeat / 2) === 0;
  const meterScore = onBeat ? 0.4 : halfBeat ? 0.2 : 0;

  return durationScore + velocityScore + pitchScore + meterScore;
}

function scoreTransition(
  prev: QuantizedNote,
  current: QuantizedNote,
  stepsPerBeat: number
): number {
  const interval = Math.abs(current.pitch - prev.pitch);
  const gapSteps = Math.max(0, current.startStep - prev.endStep);

  const intervalScore = interval <= 2 ? 0.6 : interval <= 5 ? 0.3 : -interval * 0.04;
  const gapPenalty = gapSteps === 0 ? 0.2 : -gapSteps / stepsPerBeat;

  return intervalScore + gapPenalty;
}

type TimelineSegment = { startStep: number; endStep: number; pitches: number[] };

function buildTimelineSegments(notes: QuantizedNote[]): TimelineSegment[] {
  if (notes.length === 0) return [];

  const boundaries = new Set<number>();
  notes.forEach(note => {
    boundaries.add(note.startStep);
    boundaries.add(note.endStep);
  });

  const ordered = Array.from(boundaries).sort((a, b) => a - b);
  const segments: TimelineSegment[] = [];

  // Sweep active notes across boundaries so overlapping durations become stacked chords
  const startsAt = new Map<number, QuantizedNote[]>();
  const endsAt = new Map<number, QuantizedNote[]>();
  notes.forEach(note => {
    startsAt.set(note.startStep, [...(startsAt.get(note.startStep) ?? []), note]);
    endsAt.set(note.endStep, [...(endsAt.get(note.endStep) ?? []), note]);
  });

  const active = new Set<number>();
  for (let i = 0; i < ordered.length - 1; i++) {
    const boundary = ordered[i];
    const nextBoundary = ordered[i + 1];

    (startsAt.get(boundary) ?? []).forEach(note => active.add(note.pitch));
    (endsAt.get(boundary) ?? []).forEach(note => active.delete(note.pitch));

    if (active.size > 0) {
      segments.push({
        startStep: boundary,
        endStep: nextBoundary,
        pitches: Array.from(active),
      });
    }
  }

  return segments;
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
