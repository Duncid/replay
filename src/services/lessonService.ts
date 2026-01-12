import { supabase } from "@/integrations/supabase/client";
import {
  EvaluationOutput,
  LessonMetronomeSettings,
  LessonStartResponse,
  LessonRunSetup,
  LessonBrief,
  LessonMachineState,
  TeacherGreetingResponse,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";

// Debug response from lesson-evaluate when debug=true
export interface EvaluationDebugResponse {
  prompt: string;
  lessonBrief: LessonBrief;
  setup: LessonRunSetup;
  state: LessonMachineState;
  demoSequence: NoteSequence;
  userSequence: NoteSequence;
  skillUnlockStatus: {
    awardedSkills: string[];
    skillUnlockGuidance: Array<{ skillKey: string; guidance: string }>;
    consecutiveHighDiffPasses: number;
    currentDifficulty: number;
  };
}

/**
 * Service layer for all lesson-related API calls
 * Extracted from LearnMode component for better separation of concerns
 */

export interface StartCurriculumLessonParams {
  lessonKey: string;
  language: string;
  localUserId?: string | null;
  debug?: boolean;
  difficulty?: number;
  sequenceHistory?: NoteSequence[];
  lessonRunId?: string;
  regenerate?: boolean;
}

export interface StartFreeFormLessonParams {
  prompt: string;
  difficulty: number;
  previousSequence?: NoteSequence;
  language: string;
  model: string;
  debug?: boolean;
}

export interface RegenerateCurriculumLessonParams {
  lessonKey: string;
  setupOverrides?: Partial<LessonRunSetup>;
  language: string;
  localUserId?: string | null;
  debug?: boolean;
  difficulty?: number;
  lessonRunId: string;
  sequenceHistory?: NoteSequence[];
}

export interface RegenerateFreeFormLessonParams {
  prompt: string;
  difficulty: number;
  newBpm: number;
  newMeter: string;
  language: string;
  model: string;
  debug?: boolean;
}

export interface EvaluateStructuredLessonParams {
  lessonRunId: string;
  userSequence: NoteSequence;
  metronomeContext: {
    bpm: number;
    meter: string;
  };
  localUserId?: string | null;
  debug?: boolean;
}

export interface EvaluateFreeFormLessonParams {
  targetSequence: NoteSequence;
  userSequence: NoteSequence;
  instruction: string;
  language: string;
  model: string;
}


export interface FetchTeacherGreetingParams {
  language: string;
  localUserId?: string | null;
  debug?: boolean;
}

/**
 * Start a curriculum-based lesson
 * In debug mode, returns { prompt, lessonBrief, setup } instead of LessonStartResponse
 */
export async function startCurriculumLesson(
  params: StartCurriculumLessonParams
): Promise<LessonStartResponse | { prompt: string; lessonBrief: any; setup: any }> {
  const { data, error } = await supabase.functions.invoke("lesson-start", {
    body: {
      lessonKey: params.lessonKey,
      language: params.language,
      localUserId: params.localUserId,
      debug: params.debug || false,
      difficulty: params.difficulty,
      sequenceHistory: params.sequenceHistory,
      lessonRunId: params.lessonRunId,
      regenerate: params.regenerate,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  // In debug mode, the response structure is different
  if (params.debug) {
    return data as { prompt: string; lessonBrief: any; setup: any };
  }

  return data as LessonStartResponse;
}

/**
 * Start a free-form practice lesson
 */
export async function startFreeFormLesson(
  params: StartFreeFormLessonParams
): Promise<{
  instruction: string;
  sequence: NoteSequence;
  metronome?: LessonMetronomeSettings;
}> {
  const { data, error } = await supabase.functions.invoke("piano-learn", {
    body: {
      prompt: params.prompt,
      difficulty: params.difficulty,
      previousSequence: params.previousSequence,
      language: params.language,
      model: params.model,
      debug: params.debug || false,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  if (!data?.instruction || !data?.sequence) {
    throw new Error("Invalid lesson response");
  }

  return {
    instruction: data.instruction,
    sequence: data.sequence,
    metronome: data.metronome,
  };
}

/**
 * Regenerate a curriculum lesson with new settings
 */
export async function regenerateCurriculumLesson(
  params: RegenerateCurriculumLessonParams
): Promise<LessonStartResponse> {
  const { data, error } = await supabase.functions.invoke("lesson-start", {
    body: {
      lessonKey: params.lessonKey,
      language: params.language,
      localUserId: params.localUserId,
      debug: params.debug || false,
      difficulty: params.difficulty,
      lessonRunId: params.lessonRunId,
      regenerate: true,
      setupOverrides: params.setupOverrides,
      sequenceHistory: params.sequenceHistory,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data as LessonStartResponse;
}

/**
 * Regenerate a free-form lesson with new BPM/meter
 */
export async function regenerateFreeFormLesson(
  params: RegenerateFreeFormLessonParams
): Promise<{
  instruction: string;
  sequence: NoteSequence;
  metronome?: LessonMetronomeSettings;
}> {
  const { data, error } = await supabase.functions.invoke("piano-learn", {
    body: {
      prompt: params.prompt,
      difficulty: params.difficulty,
      language: params.language,
      model: params.model,
      debug: params.debug || false,
      metronomeBpm: params.newBpm,
      metronomeTimeSignature: params.newMeter,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  if (!data?.instruction || !data?.sequence) {
    throw new Error("Invalid lesson response");
  }

  return {
    instruction: data.instruction,
    sequence: data.sequence,
    metronome: data.metronome,
  };
}

/**
 * Evaluate a structured (curriculum) lesson attempt
 * Returns combined grader + coach output from the merged endpoint
 * In debug mode, returns the full prompt instead of calling the LLM
 */
export async function evaluateStructuredLesson(
  params: EvaluateStructuredLessonParams
): Promise<EvaluationOutput | EvaluationDebugResponse> {
  const { data, error } = await supabase.functions.invoke("lesson-evaluate", {
    body: {
      lessonRunId: params.lessonRunId,
      userSequence: params.userSequence,
      metronomeContext: params.metronomeContext,
      localUserId: params.localUserId,
      debug: params.debug || false,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  // Return data as-is - caller must check for 'prompt' field to determine type
  return data as EvaluationOutput | EvaluationDebugResponse;
}

/**
 * Evaluate a free-form practice attempt
 */
export async function evaluateFreeFormLesson(
  params: EvaluateFreeFormLessonParams
): Promise<{
  evaluation: "correct" | "close" | "wrong";
  feedback: string;
}> {
  const { data, error } = await supabase.functions.invoke("piano-evaluate", {
    body: {
      targetSequence: params.targetSequence,
      userSequence: params.userSequence,
      instruction: params.instruction,
      language: params.language,
      model: params.model,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return {
    evaluation: data.evaluation as "correct" | "close" | "wrong",
    feedback: data.feedback as string,
  };
}

/**
 * Fetch teacher greeting with suggestions
 */
export async function fetchTeacherGreeting(
  params: FetchTeacherGreetingParams
): Promise<TeacherGreetingResponse> {
  const { data, error } = await supabase.functions.invoke("teacher-greet", {
    body: {
      language: params.language,
      debug: params.debug || false,
      localUserId: params.localUserId,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  // Transform backend response to match TeacherGreetingResponse type
  // The backend now returns activityKey/activityType, but we need to ensure backwards compatibility
  const suggestions = (data.suggestions || []).map((s: Record<string, unknown>) => ({
    activityKey: (s.activityKey as string) || (s.lessonKey as string) || "",
    activityType: (s.activityType as "lesson" | "tune") || "lesson",
    label: s.label as string,
    why: s.why as string,
    trackTitle: s.trackTitle as string,
    level: s.level as "beginner" | "intermediate" | "advanced" | undefined,
    musicRef: s.musicRef as string | undefined,
    lessonKey: (s.lessonKey as string) || (s.activityKey as string),
  }));

  return {
    greeting: data.greeting,
    suggestions,
    notes: data.notes,
  };
}

/**
 * Fetch skill unlock status from database
 */
export async function fetchSkillStatus(
  skillKey: string,
  skillTitle?: string,
  localUserId?: string | null
): Promise<{
  skillKey: string;
  title: string;
  isUnlocked: boolean;
} | null> {
  try {
    let query = supabase
      .from("user_skill_state")
      .select("unlocked")
      .eq("skill_key", skillKey);
    
    if (localUserId) {
      query = query.eq("local_user_id", localUserId);
    }

    const { data: skillState } = await query.maybeSingle();

    return {
      skillKey,
      title: skillTitle || skillKey,
      isUnlocked: skillState?.unlocked ?? false,
    };
  } catch (err) {
    console.error("Failed to fetch skill status:", err);
    return null;
  }
}

/**
 * Fetch skill title from curriculum nodes
 */
export async function fetchSkillTitle(skillKey: string): Promise<string> {
  try {
    // Get latest published version
    const { data: latestVersion } = await supabase
      .from("curriculum_versions")
      .select("id")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestVersion) return skillKey;

    const { data: skillNode } = await supabase
      .from("curriculum_nodes")
      .select("data")
      .eq("version_id", latestVersion.id)
      .eq("node_key", skillKey)
      .eq("node_type", "skill")
      .maybeSingle();

    if (skillNode?.data) {
      const skillData = skillNode.data as Record<string, unknown>;
      return (skillData.label as string) || skillKey;
    }
    return skillKey;
  } catch (err) {
    console.error("Failed to fetch skill title:", err);
    return skillKey;
  }
}

