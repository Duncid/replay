/**
 * NoteSequence format - compatible with Google Magenta's NoteSequence proto
 * Used as the native format throughout the app for recording, storage, and AI exchange
 */

export interface Note {
  /** MIDI pitch number (21-108 for standard piano, 48-84 for C3-C6) */
  pitch: number;
  /** Start time in seconds from the beginning of the sequence */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Velocity (0.0-1.0, normalized from MIDI 0-127) */
  velocity: number;
}

export interface Tempo {
  /** Time in seconds when this tempo starts */
  time: number;
  /** Quarter notes per minute */
  qpm: number;
}

export interface TimeSignature {
  /** Time in seconds when this time signature starts */
  time: number;
  /** Numerator (e.g., 4 in 4/4) */
  numerator: number;
  /** Denominator (e.g., 4 in 4/4) */
  denominator: number;
}

export interface NoteSequence {
  /** Array of notes in the sequence */
  notes: Note[];
  /** Total duration of the sequence in seconds */
  totalTime: number;
  /** Tempo changes (optional, defaults to 120 BPM) */
  tempos?: Tempo[];
  /** Time signature changes (optional, defaults to 4/4) */
  timeSignatures?: TimeSignature[];
}

/** Default tempo if not specified */
export const DEFAULT_QPM = 120;

/** Default time signature if not specified */
export const DEFAULT_TIME_SIGNATURE = { numerator: 4, denominator: 4 };
