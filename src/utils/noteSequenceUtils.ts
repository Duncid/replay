import { NoteSequence, Note, DEFAULT_QPM } from "@/types/noteSequence";

// MIDI note number constants
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

interface TempoEvent {
  timeBeats: number;
  qpm: number;
}

interface TimeSignatureEvent {
  timeBeats: number;
  numerator: number;
  denominator: number;
}

interface NoteEvent {
  pitch: number;
  startBeats: number;
  endBeats: number;
  velocity: number;
}

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

function midiPitch(step: string, octave: number, alter: number = 0): number {
  const base = STEP_TO_SEMITONE[step.toUpperCase()];
  return (octave + 1) * 12 + base + alter;
}

function normalizeVelocity(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function beatsToSecondsWithTempoMap(beat: number, tempoEvents: TempoEvent[]): number {
  const sorted = tempoEvents.length > 0 ? [...tempoEvents].sort((a, b) => a.timeBeats - b.timeBeats) : [
    { timeBeats: 0, qpm: DEFAULT_QPM },
  ];

  if (beat <= sorted[0].timeBeats) {
    return (beat - sorted[0].timeBeats) * 60 / sorted[0].qpm;
  }

  let seconds = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i].timeBeats;
    const end = i + 1 < sorted.length ? sorted[i + 1].timeBeats : beat;
    if (beat <= start) {
      break;
    }
    const segmentEnd = Math.min(beat, end);
    if (segmentEnd > start) {
      seconds += (segmentEnd - start) * 60 / sorted[i].qpm;
    }
    if (beat <= end) {
      break;
    }
  }

  return seconds;
}

function getDirectChildren(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === tagName);
}

function getFirstChild(element: Element | null, tagName: string): Element | null {
  if (!element) return null;
  return getDirectChildren(element, tagName)[0] ?? null;
}

function getTextContent(element: Element | null): string {
  return element?.textContent?.trim() ?? "";
}

function parseTempoFromDirection(direction: Element): number | null {
  const sound = getFirstChild(direction, "sound");
  if (sound?.getAttribute("tempo")) {
    const tempo = Number(sound.getAttribute("tempo"));
    if (!Number.isNaN(tempo)) {
      return tempo;
    }
  }

  const directionType = getFirstChild(direction, "direction-type");
  const metronome = getFirstChild(directionType, "metronome");
  const perMinute = getFirstChild(metronome, "per-minute");
  if (perMinute?.textContent) {
    const tempo = Number(perMinute.textContent.trim());
    if (!Number.isNaN(tempo)) {
      return tempo;
    }
  }

  return null;
}

function parseDynamicsFromDirection(direction: Element): number | null {
  const directionType = getFirstChild(direction, "direction-type");
  const dynamics = getFirstChild(directionType, "dynamics");
  if (!dynamics) return null;

  const child = Array.from(dynamics.children)[0];
  if (!child) return null;

  const tag = child.localName.toLowerCase();
  const mapping: Record<string, number> = {
    ppp: 0.25,
    pp: 0.35,
    p: 0.45,
    mp: 0.55,
    mf: 0.65,
    f: 0.78,
    ff: 0.9,
    fff: 1,
  };

  return mapping[tag] ?? null;
}

export function musicXmlToNoteSequence(
  xmlText: string,
  options: { defaultQpm?: number; defaultVelocity?: number; mergeTies?: boolean } = {}
): NoteSequence {
  const { defaultQpm = DEFAULT_QPM, defaultVelocity = 0.8, mergeTies = true } = options;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Invalid MusicXML file");
  }

  const tempoEvents: TempoEvent[] = [{ timeBeats: 0, qpm: defaultQpm }];
  const timeSignatures: TimeSignatureEvent[] = [];
  const notes: NoteEvent[] = [];
  const currentVelocityByPart = new Map<string, number>();

  const parts = Array.from(doc.getElementsByTagNameNS("*", "part"));
  parts.forEach((part) => {
    const partId = part.getAttribute("id") ?? "P1";
    if (!currentVelocityByPart.has(partId)) {
      currentVelocityByPart.set(partId, defaultVelocity);
    }

    let timeBeats = 0;
    let divisions = 1;
    const tieActive = new Map<string, NoteEvent>();

    const measures = getDirectChildren(part, "measure");

    // Read divisions from first measure BEFORE processing notes
    if (measures.length > 0) {
      const firstMeasure = measures[0];
      const firstAttributes = getFirstChild(firstMeasure, "attributes");
      if (firstAttributes) {
        const divisionsEl = getFirstChild(firstAttributes, "divisions");
        if (divisionsEl?.textContent) {
          const parsed = Number(divisionsEl.textContent.trim());
          if (!Number.isNaN(parsed) && parsed > 0) {
            divisions = Math.max(1, Math.floor(parsed));
          }
        }
      }

      // If divisions not found, try to infer from note durations
      if (divisions === 1) {
        const firstNotes = getDirectChildren(firstMeasure, "note");
        const durations: number[] = [];
        for (const note of firstNotes.slice(0, 10)) {
          // Check first 10 notes
          const durationEl = getFirstChild(note, "duration");
          if (durationEl?.textContent) {
            const durationDiv = Number(durationEl.textContent.trim());
            if (!Number.isNaN(durationDiv) && durationDiv > 1) {
              durations.push(durationDiv);
            }
          }
        }
        if (durations.length > 0) {
          // Try common divisions values
          for (const commonDiv of [480, 96, 24, 12, 8, 4, 2]) {
            if (durations.some((d) => d % commonDiv === 0)) {
              divisions = commonDiv;
              console.warn(
                `[MusicXML] Divisions not specified in part ${partId}, inferred as ${divisions} from note durations`
              );
              break;
            }
          }
        }
      }
    }

    measures.forEach((measure, measureIndex) => {
      const attributes = getFirstChild(measure, "attributes");
      if (attributes) {
        const divisionsEl = getFirstChild(attributes, "divisions");
        if (divisionsEl?.textContent) {
          const parsed = Number(divisionsEl.textContent.trim());
          if (!Number.isNaN(parsed) && parsed > 0) {
            const newDivisions = Math.max(1, Math.floor(parsed));
            if (measureIndex > 0 && newDivisions !== divisions) {
              console.warn(
                `[MusicXML] Divisions changed from ${divisions} to ${newDivisions} ` +
                  `at measure ${measureIndex + 1} in part ${partId}. Timing may be inaccurate.`
              );
            }
            divisions = newDivisions;
          }
        }

        const time = getFirstChild(attributes, "time");
        const beatsEl = getFirstChild(time, "beats");
        const beatTypeEl = getFirstChild(time, "beat-type");
        if (beatsEl?.textContent && beatTypeEl?.textContent) {
          const numerator = Number(beatsEl.textContent.trim());
          const denominator = Number(beatTypeEl.textContent.trim());
          if (!Number.isNaN(numerator) && !Number.isNaN(denominator)) {
            timeSignatures.push({ timeBeats, numerator, denominator });
          }
        }
      }

      const directions = getDirectChildren(measure, "direction");
      directions.forEach((direction) => {
        const tempo = parseTempoFromDirection(direction);
        if (tempo !== null) {
          tempoEvents.push({ timeBeats, qpm: tempo });
        }

        const dynamics = parseDynamicsFromDirection(direction);
        if (dynamics !== null) {
          currentVelocityByPart.set(partId, normalizeVelocity(dynamics));
        }
      });

      let chordStartBeats: number | null = null;
      const measureNotes = getDirectChildren(measure, "note");
      measureNotes.forEach((note) => {
        const durationEl = getFirstChild(note, "duration");
        if (!durationEl?.textContent) {
          console.warn(
            `[MusicXML] Note missing duration element in part ${partId}, measure ${measureIndex + 1}, skipping`
          );
          return;
        }
        const durationDiv = Number(durationEl.textContent.trim());
        if (Number.isNaN(durationDiv) || durationDiv <= 0) {
          console.warn(
            `[MusicXML] Invalid duration "${durationEl.textContent}" in part ${partId}, measure ${measureIndex + 1}, skipping`
          );
          return;
        }

        const durationBeats = durationDiv / divisions;
        const isRest = getFirstChild(note, "rest") !== null;
        const isChord = getFirstChild(note, "chord") !== null;
        const voice = getTextContent(getFirstChild(note, "voice")) || "1";
        const staff = getTextContent(getFirstChild(note, "staff")) || "1";

        if (!isChord) {
          chordStartBeats = timeBeats;
        }

        const startBeats = chordStartBeats ?? timeBeats;
        const endBeats = startBeats + durationBeats;

        const ties = getDirectChildren(note, "tie");
        const tieStarts = ties.some((tie) => tie.getAttribute("type") === "start");
        const tieStops = ties.some((tie) => tie.getAttribute("type") === "stop");

        if (isRest) {
          timeBeats += durationBeats;
          return;
        }

        const pitchEl = getFirstChild(note, "pitch");
        if (!pitchEl) {
          console.warn(
            `[MusicXML] Note without pitch element (possibly malformed) in part ${partId}, measure ${measureIndex + 1}, skipping`
          );
          return;
        }

        const step = getTextContent(getFirstChild(pitchEl, "step"));
        const octaveText = getTextContent(getFirstChild(pitchEl, "octave"));
        const alterText = getTextContent(getFirstChild(pitchEl, "alter"));

        if (!step) {
          console.warn(
            `[MusicXML] Note missing pitch step in part ${partId}, measure ${measureIndex + 1}, skipping`
          );
          return;
        }

        const octave = octaveText ? Number(octaveText) : 4;
        let alter = alterText ? Number(alterText) : 0;

        if (Number.isNaN(octave)) {
          console.warn(
            `[MusicXML] Invalid octave "${octaveText}" for note with step="${step}" in part ${partId}, measure ${measureIndex + 1}, skipping`
          );
          return;
        }
        if (alterText && Number.isNaN(alter)) {
          console.warn(
            `[MusicXML] Invalid alter "${alterText}" for note with step="${step}", octave="${octave}" in part ${partId}, measure ${measureIndex + 1}, using 0`
          );
          alter = 0; // Continue with alter = 0
        }

        const pitch = midiPitch(step, octave, alter);
        const velocity = currentVelocityByPart.get(partId) ?? defaultVelocity;
        const key = `${pitch}|${voice}|${staff}|${partId}`;

        if (mergeTies && (tieStarts || tieStops)) {
          if (tieStarts && !tieStops) {
            tieActive.set(key, {
              pitch,
              startBeats,
              endBeats,
              velocity,
            });
          } else if (tieStops && tieActive.has(key)) {
            const active = tieActive.get(key)!;
            active.endBeats = endBeats;
            if (!tieStarts) {
              notes.push(active);
              tieActive.delete(key);
            }
          } else {
            notes.push({ pitch, startBeats, endBeats, velocity });
          }
        } else {
          notes.push({ pitch, startBeats, endBeats, velocity });
        }

        if (!isChord) {
          timeBeats += durationBeats;
        }
      });

    });

    if (mergeTies && tieActive.size > 0) {
      tieActive.forEach((active) => notes.push(active));
      tieActive.clear();
    }
  });

  const sortedTempoEvents = tempoEvents
    .sort((a, b) => a.timeBeats - b.timeBeats)
    .reduce<TempoEvent[]>((acc, event) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.timeBeats - event.timeBeats) < 1e-9) {
        acc[acc.length - 1] = event;
      } else {
        acc.push(event);
      }
      return acc;
    }, []);

  const sortedTimeSigs = timeSignatures
    .sort((a, b) => a.timeBeats - b.timeBeats)
    .reduce<TimeSignatureEvent[]>((acc, event) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.timeBeats - event.timeBeats) < 1e-9) {
        acc[acc.length - 1] = event;
      } else {
        acc.push(event);
      }
      return acc;
    }, []);

  const outNotes = notes.map((note) => {
    const startTime = beatsToSecondsWithTempoMap(note.startBeats, sortedTempoEvents);
    const endTime = beatsToSecondsWithTempoMap(note.endBeats, sortedTempoEvents);
    const safeEnd = endTime <= startTime ? startTime + 0.01 : endTime;

    return {
      pitch: note.pitch,
      startTime: Number(startTime.toFixed(6)),
      endTime: Number(safeEnd.toFixed(6)),
      velocity: Number(normalizeVelocity(note.velocity).toFixed(3)),
    };
  });

  outNotes.sort((a, b) => {
    if (a.startTime === b.startTime) {
      return a.pitch - b.pitch;
    }
    return a.startTime - b.startTime;
  });

  const totalTime = outNotes.reduce((max, note) => Math.max(max, note.endTime), 0);

  return {
    notes: outNotes,
    totalTime: Number(totalTime.toFixed(6)),
    tempos: sortedTempoEvents.length
      ? sortedTempoEvents.map((event) => ({
        time: Number(beatsToSecondsWithTempoMap(event.timeBeats, sortedTempoEvents).toFixed(6)),
        qpm: event.qpm,
      }))
      : [{ time: 0, qpm: defaultQpm }],
    timeSignatures: sortedTimeSigs.length
      ? sortedTimeSigs.map((event) => ({
        time: Number(beatsToSecondsWithTempoMap(event.timeBeats, sortedTempoEvents).toFixed(6)),
        numerator: event.numerator,
        denominator: event.denominator,
      }))
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
