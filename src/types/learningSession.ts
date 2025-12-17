import { NoteSequence } from "./noteSequence";

export type LessonPhase = "prompt" | "your_turn";

// Types for metronome settings that the LLM can control
export type LessonFeelPreset =
  | "straight_beats"
  | "straight_8ths"
  | "triplets"
  | "straight_16ths"
  | "swing_light"
  | "swing_medium"
  | "swing_heavy"
  | "shuffle";

export type LessonMetronomeSoundType = "classic" | "woodblock" | "digital" | "hihat" | "clave";

export interface LessonMetronomeSettings {
  bpm?: number;
  timeSignature?: string;
  isActive?: boolean;
  feel?: LessonFeelPreset;
  soundType?: LessonMetronomeSoundType;
  accentPreset?: string;
}

export interface LessonState {
  /** AI's explanation of what the user will play */
  instruction: string;
  /** The target sequence the user should replicate */
  targetSequence: NoteSequence;
  /** Current phase of the lesson */
  phase: LessonPhase;
  /** Current attempt count */
  attempts: number;
  /** Successful validations */
  validations: number;
  /** AI feedback on last attempt */
  feedback: string | null;
  /** Current difficulty level (increments after each lesson success) */
  difficulty: number;
  /** User's original prompt */
  userPrompt: string;
}

export interface LessonGenerationResponse {
  instruction: string;
  sequence: NoteSequence;
  metronome?: LessonMetronomeSettings;
}

export interface EvaluationResponse {
  evaluation: "correct" | "close" | "wrong";
  feedback: string;
}

export const createInitialLessonState = (): LessonState => ({
  instruction: "",
  targetSequence: { notes: [], totalTime: 0 },
  phase: "prompt",
  attempts: 0,
  validations: 0,
  feedback: null,
  difficulty: 1,
  userPrompt: "",
});
