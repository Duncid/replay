import type { Note, NoteSequence } from "./noteSequence";

// The small API surface used from the on-demand browser UMD runtime.
// Keeping these contracts locally avoids installing the unused Node/TensorFlow
// package tree merely to import protobuf interfaces.
export interface MagentaNote extends Omit<Note, "velocity"> {
  velocity?: number;
  quantizedStartStep?: number;
  quantizedEndStep?: number;
}

export interface MagentaNoteSequence extends Omit<Partial<NoteSequence>, "notes"> {
  notes?: MagentaNote[];
  quantizationInfo?: { stepsPerQuarter: number };
  totalQuantizedSteps?: number;
}

export interface MusicRNN {
  initialize(): Promise<void>;
  continueSequence(sequence: MagentaNoteSequence, steps: number, temperature: number, chords: string[]): Promise<MagentaNoteSequence>;
}

export interface MusicVAE {
  initialize(): Promise<void>;
  dataConverter?: { numSteps: number };
  encode(sequences: MagentaNoteSequence[]): Promise<unknown>;
  decode(latent: unknown, temperature: number): Promise<MagentaNoteSequence[]>;
}

export interface MagentaApi {
  MusicRNN: new (checkpoint: string) => MusicRNN;
  MusicVAE: new (checkpoint: string) => MusicVAE;
  sequences: {
    quantizeNoteSequence(sequence: MagentaNoteSequence, stepsPerQuarter: number): MagentaNoteSequence;
    unquantizeSequence(sequence: MagentaNoteSequence): MagentaNoteSequence;
  };
  midiToSequenceProto(bytes: Uint8Array): MagentaNoteSequence;
}
