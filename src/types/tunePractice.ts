// Types for Tune Practice Mode

export interface TuneMotif {
  id: string;
  label: string;
  importance: 'high' | 'medium' | 'low';
  description: string;
  occurrences: string[];
}

export interface TuneNugget {
  id: string;
  label: string;
  location: {
    measures: [number, number];
    startBeat?: number;
    endBeat?: number;
  };
  staffFocus: 'rh' | 'lh' | 'both';
  priority: number;
  difficulty: number;
  dependsOn: string[];
  teacherHints: {
    goal: string;
    counting?: string;
    commonMistakes?: string;
    whatToListenFor?: string;
  };
  practicePlan?: {
    tempoStart: number;
    tempoTarget: number;
    reps: number;
  };
  noteSequence?: unknown; // INoteSequence from magenta
}

export interface TuneBriefing {
  title: string;
  schemaVersion: number;
  pipeline?: {
    instrument: string;
    staffToHand: Record<string, string>;
    tempoSource: string;
  };
  motifs: TuneMotif[];
  teachingOrder: string[];
}

export interface PracticePlanItem {
  nuggetId: string;
  nugget: TuneNugget;
  instruction: string;
  motifs: string[];
}

export interface TuneCoachResponse {
  practicePlan: PracticePlanItem[];
  encouragement: string;
  tuneTitle: string;
  motifsSummary: TuneMotif[];
  practiceHistory: NuggetPracticeHistory[];
}

export interface NuggetPracticeHistory {
  nuggetId: string;
  attemptCount: number;
  passCount: number;
  currentStreak: number;
  bestStreak: number;
  lastPracticedAt: string | null;
}

export interface TuneEvaluationResponse {
  evaluation: 'pass' | 'close' | 'fail';
  feedbackText: string;
  currentStreak: number;
  suggestNewNugget: boolean;
  nextNuggetSuggestion?: string;
  replayDemo: boolean;
}

export interface TunePracticeState {
  phase: 'loading' | 'coaching' | 'practicing' | 'evaluating' | 'feedback';
  tuneKey: string;
  tuneTitle: string;
  practicePlan: PracticePlanItem[];
  currentIndex: number;
  currentStreak: number;
  lastEvaluation: TuneEvaluationResponse | null;
  error: string | null;
}

export interface TuneDebugData {
  tuneKey: string;
  tuneTitle: string;
  motifsCount: number;
  nuggetsCount: number;
  practiceHistory: NuggetPracticeHistory[];
  prompt?: string;
  request?: unknown;
}

export interface TuneEvaluationDebugData {
  tuneKey: string;
  nuggetId: string;
  targetSequence: unknown;
  userSequence: unknown;
  prompt?: string;
  request?: unknown;
}
