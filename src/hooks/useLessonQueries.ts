import { useMutation, useQuery } from "@tanstack/react-query";
import {
  decideNextAction,
  evaluateFreeFormLesson,
  evaluateStructuredLesson,
  fetchSkillStatus,
  fetchSkillTitle,
  fetchTeacherGreeting,
  regenerateCurriculumLesson,
  regenerateFreeFormLesson,
  startCurriculumLesson,
  startFreeFormLesson,
  DecideNextActionParams,
  EvaluateFreeFormLessonParams,
  EvaluateStructuredLessonParams,
  FetchTeacherGreetingParams,
  RegenerateCurriculumLessonParams,
  RegenerateFreeFormLessonParams,
  StartCurriculumLessonParams,
  StartFreeFormLessonParams,
} from "@/services/lessonService";
import { SkillToUnlock } from "@/components/LessonCard";
import { TeacherGreetingResponse } from "@/types/learningSession";

/**
 * React Query hooks for lesson-related API calls
 * Provides automatic caching, retries, and request cancellation
 */

/**
 * Fetch teacher greeting with suggestions
 */
export function useTeacherGreeting(
  language: string,
  localUserId?: string | null,
  enabled: boolean = false
) {
  return useQuery({
    queryKey: ["teacherGreeting", language, localUserId],
    queryFn: () =>
      fetchTeacherGreeting({
        language,
        localUserId,
        debug: false,
      }),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Mutation to start a curriculum lesson
 */
export function useStartCurriculumLesson() {
  return useMutation({
    mutationFn: (params: StartCurriculumLessonParams) =>
      startCurriculumLesson(params),
  });
}

/**
 * Mutation to start a free-form lesson
 */
export function useStartFreeFormLesson() {
  return useMutation({
    mutationFn: (params: StartFreeFormLessonParams) =>
      startFreeFormLesson(params),
  });
}

/**
 * Mutation to regenerate a curriculum lesson
 */
export function useRegenerateCurriculumLesson() {
  return useMutation({
    mutationFn: (params: RegenerateCurriculumLessonParams) =>
      regenerateCurriculumLesson(params),
  });
}

/**
 * Mutation to regenerate a free-form lesson
 */
export function useRegenerateFreeFormLesson() {
  return useMutation({
    mutationFn: (params: RegenerateFreeFormLessonParams) =>
      regenerateFreeFormLesson(params),
  });
}

/**
 * Mutation to evaluate a structured lesson
 */
export function useEvaluateStructuredLesson() {
  return useMutation({
    mutationFn: (params: EvaluateStructuredLessonParams) =>
      evaluateStructuredLesson(params),
  });
}

/**
 * Mutation to evaluate a free-form lesson
 */
export function useEvaluateFreeFormLesson() {
  return useMutation({
    mutationFn: (params: EvaluateFreeFormLessonParams) =>
      evaluateFreeFormLesson(params),
  });
}

/**
 * Mutation to get coach decision
 */
export function useDecideNextAction() {
  return useMutation({
    mutationFn: (params: DecideNextActionParams) => decideNextAction(params),
  });
}

/**
 * Query to fetch skill status
 * Note: This is a query because skill status doesn't change frequently
 */
export function useSkillStatus(
  skillKey: string | null, 
  skillTitle?: string,
  localUserId?: string | null
) {
  return useQuery({
    queryKey: ["skillStatus", skillKey, skillTitle, localUserId],
    queryFn: () => {
      if (!skillKey) return null;
      return fetchSkillStatus(skillKey, skillTitle, localUserId);
    },
    enabled: !!skillKey,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Query to fetch skill title
 */
export function useSkillTitle(skillKey: string | null) {
  return useQuery({
    queryKey: ["skillTitle", skillKey],
    queryFn: () => {
      if (!skillKey) return skillKey || "";
      return fetchSkillTitle(skillKey);
    },
    enabled: !!skillKey,
    staleTime: 30 * 60 * 1000, // 30 minutes - skill titles don't change often
  });
}

