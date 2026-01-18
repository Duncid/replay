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
  label?: string;
  location: {
    startMeasure?: number;
    endMeasure?: number;
    startBeat?: number;
    endBeat?: number;
  };
  dependsOn: string[];
  modes?: string[];
  noteSequence?: unknown; // INoteSequence from magenta
  leftHandSequence?: unknown;
  rightHandSequence?: unknown;
}

export interface TuneAssembly {
  id: string;
  tier: number;
  label?: string;
  nuggetIds: string[];
  difficulty?: { level: number };
  modes?: string[];
  noteSequence?: unknown;
  leftHandSequence?: unknown;
  rightHandSequence?: unknown;
}

export interface TuneHints {
  goal?: string;
  counting?: string;
  commonMistakes?: string[];
  whatToListenFor?: string[];
}

export interface TuneBriefing {
  title: string;
  schemaVersion: string;
  pipelineSettings?: Record<string, unknown>;
  motifs: TuneMotif[];
  motifOccurrences?: Array<Record<string, unknown>>;
  tuneHints?: TuneHints;
  teachingOrder: string[];
  assemblyOrder?: string[];
}

export interface PracticePlanItem {
  itemId: string;
  itemType: 'nugget' | 'assembly';
  nugget: TuneNugget | null;
  assembly: TuneAssembly | null;
  instruction: string;
  motifs: string[];
}

export interface TuneCoachResponse {
  practicePlan: PracticePlanItem[];
  encouragement: string;
  tuneTitle: string;
  motifsSummary: TuneMotif[];
  tuneHints?: TuneHints;
  practiceHistory: NuggetPracticeHistory[];
  proficiencyLevel?: 'beginner' | 'intermediate' | 'advanced';
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
  tuneAcquired?: boolean;
  awardedSkills?: string[];
}

export interface TunePracticeState {
  phase: 'loading' | 'coaching' | 'practicing';  // Simplified: no evaluating/feedback phases
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
