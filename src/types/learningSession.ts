import { NoteSequence } from "./noteSequence";

export type LessonPhase = "welcome" | "prompt" | "your_turn";

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
  /** Current lesson node key from curriculum */
  lessonNodeKey?: string;
  /** Current lesson run ID for tracking */
  lessonRunId?: string;
  /** Track key this lesson belongs to */
  trackKey?: string;
  /** Track title for display */
  trackTitle?: string;
  /** Skills that can be awarded by this lesson */
  awardedSkills?: string[];
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

// Teacher greeting types
export interface TeacherSuggestion {
  lessonKey: string;
  label: string;
  why: string;
  trackTitle: string;
}

export interface TeacherGreetingResponse {
  greeting: string;
  suggestions: TeacherSuggestion[];
  notes?: string | null;
}

// Lesson run types for activity tracking
export interface LessonRunSetup {
  bpm?: number;
  meter?: string;
  feel?: string;
  bars?: number;
  countInBars?: number;
}

export interface LessonRun {
  id: string;
  lesson_node_key: string;
  started_at: string;
  ended_at?: string | null;
  evaluation?: "pass" | "close" | "fail" | null;
  difficulty: number;
  setup: LessonRunSetup;
  attempt_count: number;
  created_at: string;
}

export interface UserSkillState {
  id: string;
  skill_key: string;
  unlocked: boolean;
  mastery: number;
  last_practiced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PracticeSession {
  id: string;
  started_at: string;
  ended_at?: string | null;
  lesson_run_ids: string[];
  created_at: string;
}

// Lesson Brief - compiled once at lesson start, reused for all turns
export interface LessonBrief {
  lessonKey: string;
  title: string;
  goal: string;
  setupGuidance: string;
  evaluationGuidance: string;
  difficultyGuidance: string;
  requiredSkills: string[];
  awardedSkills: string[];
  nextLessonKey: string | null;
  trackKey?: string;
  trackTitle?: string;
}

// Grader output from lesson-evaluate
export interface GraderOutput {
  evaluation: "pass" | "close" | "fail";
  diagnosis: string[];
  feedbackText: string;
  suggestedAdjustment: "easier" | "same" | "harder";
  nextSetup?: Partial<LessonRunSetup>;
}

// Coach decision from lesson-decide (DEPRECATED - merged into EvaluationOutput)
export type CoachNextAction = "RETRY_SAME" | "MAKE_EASIER" | "MAKE_HARDER" | "EXIT_TO_MAIN_TEACHER";

export interface CoachOutput {
  feedbackText: string;
  nextAction: CoachNextAction;
  setupDelta?: Partial<LessonRunSetup>;
  exitHint?: string;
}

// Combined evaluation output from merged lesson-evaluate endpoint
export interface EvaluationOutput {
  // Grader fields
  evaluation: "pass" | "close" | "fail";
  diagnosis: string[];
  // Coach fields
  feedbackText: string;
  nextAction: CoachNextAction;
  setupDelta?: Partial<LessonRunSetup>;
  awardedSkills?: string[];
  exitHint?: string;
}

// Lesson state for the state machine
export interface LessonMachineState {
  turn: number;
  passStreak: number;
  failStreak: number;
  lastDecision: CoachNextAction | null;
  phase: "intro" | "practice" | "evaluate" | "feedback" | "exit";
}

// Response from lesson-start endpoint
export interface LessonStartResponse {
  lessonRunId: string;
  instruction: string;
  demoSequence?: NoteSequence;
  setup: LessonRunSetup;
  metronome?: LessonMetronomeSettings;
  lessonBrief: LessonBrief;
  composedPrompt?: string; // When debug: true
  difficulty?: number;
}

export const createInitialLessonState = (): LessonState => ({
  instruction: "",
  targetSequence: { notes: [], totalTime: 0 },
  phase: "welcome",
  attempts: 0,
  validations: 0,
  feedback: null,
  difficulty: 1,
  userPrompt: "",
});
