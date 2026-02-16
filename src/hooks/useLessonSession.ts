import type { SkillToUnlock } from "@/components/LessonCard";
import {
  fetchSkillStatus,
  fetchSkillTitle,
} from "@/services/lessonService";
import {
  getSequenceHistory,
  addSequenceToHistory,
} from "@/utils/lessonSequenceHistory";
import type { LessonMetronomeSettings } from "@/types/learningSession";
import type { NoteSequence } from "@/types/noteSequence";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  useStartCurriculumLesson,
  useRegenerateCurriculumLesson,
  useEvaluateStructuredLesson,
} from "@/hooks/useLessonQueries";
import type { EvaluationOutput } from "@/types/learningSession";
import type { LessonDebugInfo } from "@/hooks/useLessonEngine";

export interface LessonSessionData {
  instruction: string;
  targetSequence: NoteSequence;
  lessonRunId: string | undefined;
  lessonNodeKey: string;
  difficulty: number;
  trackTitle: string | undefined;
  trackKey: string | undefined;
  awardedSkills: string[];
}

export interface LessonSessionEvaluationState {
  type: "structured";
  evaluationOutput: EvaluationOutput;
  awardedSkillsWithTitles?: SkillToUnlock[];
}

export interface UseLessonSessionOptions {
  language: string;
  localUserId?: string | null;
  debugMode: boolean;
  metronomeBpm: number;
  metronomeTimeSignature: string;
  onClearRecording: () => void;
  onPlaySequence: (sequence: NoteSequence) => void;
  applyMetronomeSettings: (settings?: LessonMetronomeSettings) => void;
  setMetronomeBpm?: (bpm: number) => void;
  setMetronomeTimeSignature?: (ts: string) => void;
}

export function useLessonSession(
  lessonKey: string,
  options: UseLessonSessionOptions
) {
  const {
    language,
    localUserId,
    debugMode,
    metronomeBpm,
    metronomeTimeSignature,
    onClearRecording,
    onPlaySequence,
    applyMetronomeSettings,
    setMetronomeBpm,
    setMetronomeTimeSignature,
  } = options;

  const { toast } = useToast();
  const { t } = useTranslation();

  const startMutation = useStartCurriculumLesson();
  const regenerateMutation = useRegenerateCurriculumLesson();
  const evaluateMutation = useEvaluateStructuredLesson();

  const [lesson, setLesson] = useState<LessonSessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationState, setEvaluationState] =
    useState<LessonSessionEvaluationState | null>(null);
  const [skillToUnlock, setSkillToUnlock] = useState<SkillToUnlock | null>(null);
  const [debugInfo, setDebugInfo] = useState<LessonDebugInfo>({});

  const hasEvaluatedRef = useRef(false);
  const userActionTokenRef = useRef(crypto.randomUUID());

  const startLesson = useCallback(async () => {
    if (!lessonKey) return;
    userActionTokenRef.current = crypto.randomUUID();
    const actionToken = userActionTokenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const sequenceHistory = getSequenceHistory(lessonKey);
      const lessonStartData = await startMutation.mutateAsync({
        lessonKey,
        language,
        localUserId,
        debug: false,
        difficulty: 1,
        sequenceHistory,
      });

      if (userActionTokenRef.current !== actionToken) return;
      if ("prompt" in lessonStartData) {
        throw new Error("Unexpected debug response in non-debug mode");
      }

      if (debugMode) {
        setDebugInfo((prev) => ({
          ...prev,
          lessonGeneration: {
            ...prev.lessonGeneration,
            response: JSON.stringify(lessonStartData, null, 2),
          },
        }));
      }

      const lessonRunId = lessonStartData.lessonRunId;
      const instruction = lessonStartData.instruction;
      const targetSequence =
        lessonStartData.demoSequence || { notes: [], totalTime: 0 };
      const lessonBrief = lessonStartData.lessonBrief;
      const metronomeSettings = lessonStartData.metronome;
      const trackKey = lessonBrief.trackKey;
      const trackTitle = lessonBrief.trackTitle;
      const awardedSkills = lessonBrief.awardedSkills || [];
      const lessonDifficulty = lessonStartData.difficulty ?? 1;

      if (targetSequence.notes.length > 0) {
        addSequenceToHistory(lessonKey, targetSequence);
      }
      if (metronomeSettings) {
        applyMetronomeSettings(metronomeSettings);
      }

      setLesson({
        instruction,
        targetSequence,
        lessonRunId,
        lessonNodeKey: lessonKey,
        difficulty: lessonDifficulty,
        trackTitle,
        trackKey,
        awardedSkills,
      });
      setSkillToUnlock(null);
      setEvaluationState(null);
      hasEvaluatedRef.current = false;
      setIsLoading(false);
      onClearRecording();

      if (awardedSkills.length > 0) {
        void fetchSkillTitle(awardedSkills[0])
          .then((skillTitle) =>
            fetchSkillStatus(awardedSkills[0], skillTitle, localUserId)
          )
          .then((status) => {
            if (status) setSkillToUnlock(status);
          })
          .catch((err) => console.warn("Skill fetch failed:", err));
      }

      setTimeout(() => onPlaySequence(targetSequence), 500);
    } catch (err) {
      console.error("Failed to start lesson:", err);
      setError(
        err instanceof Error ? err.message : t("learnMode.generateErrorDescription")
      );
      toast({
        title: t("learnMode.generateErrorTitle"),
        description:
          err instanceof Error ? err.message : t("learnMode.generateErrorDescription"),
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [
    lessonKey,
    language,
    localUserId,
    debugMode,
    startMutation,
    applyMetronomeSettings,
    onClearRecording,
    onPlaySequence,
    toast,
    t,
  ]);

  const startLessonRef = useRef(startLesson);
  startLessonRef.current = startLesson;
  useEffect(() => {
    if (lessonKey) startLessonRef.current();
  }, [lessonKey]);

  const regenerateWithNewSettings = useCallback(
    async (newBpm: number, newMeter: string, newDifficulty?: number) => {
      const current = lesson;
      if (!current?.lessonRunId) return;

      try {
        const lessonStartData = await regenerateMutation.mutateAsync({
          lessonKey: current.lessonNodeKey,
          lessonRunId: current.lessonRunId,
          language,
          localUserId,
          setupOverrides: { bpm: newBpm, meter: newMeter },
          difficulty: newDifficulty,
        });

        if (lessonStartData.metronome) {
          applyMetronomeSettings(lessonStartData.metronome);
        }

        const newSequence =
          lessonStartData.demoSequence || current.targetSequence;
        setLesson((prev) =>
          prev
            ? {
                ...prev,
                instruction: lessonStartData.instruction,
                targetSequence: newSequence,
                lessonRunId: lessonStartData.lessonRunId,
                trackKey: lessonStartData.lessonBrief.trackKey,
                trackTitle: lessonStartData.lessonBrief.trackTitle,
                awardedSkills:
                  lessonStartData.lessonBrief.awardedSkills || [],
                difficulty:
                  lessonStartData.difficulty ?? prev.difficulty,
              }
            : null
        );
        setEvaluationState(null);
        hasEvaluatedRef.current = false;
        if (newSequence.notes.length > 0) {
          addSequenceToHistory(current.lessonNodeKey, newSequence);
        }
        setTimeout(() => onPlaySequence(newSequence), 500);
      } catch (err) {
        console.error("Failed to regenerate lesson:", err);
        toast({
          title: "Error",
          description: "Failed to regenerate lesson with new settings",
          variant: "destructive",
        });
      }
    },
    [
      lesson,
      regenerateMutation,
      language,
      localUserId,
      applyMetronomeSettings,
      onPlaySequence,
      toast,
    ]
  );

  const evaluateAttempt = useCallback(
    async (userSequence: NoteSequence) => {
      const current = lesson;
      if (!current?.lessonRunId) return;

      if (debugMode) {
        evaluateMutation
          .mutateAsync({
            lessonRunId: current.lessonRunId,
            userSequence,
            metronomeContext: { bpm: metronomeBpm, meter: metronomeTimeSignature },
            localUserId,
            debug: true,
          })
          .then((debugResponse: { prompt?: string }) => {
            if (debugResponse?.prompt) {
              setDebugInfo((prev) => ({
                ...prev,
                evaluation: {
                  ...prev.evaluation,
                  request: debugResponse.prompt,
                },
              }));
            }
          })
          .catch((e) => console.error("Debug eval failed:", e));
      }

      const actionToken = userActionTokenRef.current;
      setIsEvaluating(true);
      setEvaluationState(null);

      try {
        const evaluationOutput = await evaluateMutation.mutateAsync({
          lessonRunId: current.lessonRunId,
          userSequence,
          metronomeContext: { bpm: metronomeBpm, meter: metronomeTimeSignature },
          localUserId,
        });

        if (userActionTokenRef.current !== actionToken) return;

        if (debugMode) {
          setDebugInfo((prev) => ({
            ...prev,
            evaluation: {
              ...prev.evaluation,
              response: JSON.stringify(evaluationOutput, null, 2),
            },
          }));
          const evalEmoji =
            evaluationOutput.evaluation === "pass"
              ? "✅"
              : evaluationOutput.evaluation === "close"
                ? "⚠️"
                : "❌";
          const evalLabel =
            evaluationOutput.evaluation === "pass"
              ? "Pass"
              : evaluationOutput.evaluation === "close"
                ? "Close"
                : "Fail";
          toast({
            title: `${evalEmoji} Evaluation: ${evalLabel}`,
            description:
              evaluationOutput.diagnosis?.join(", ") ||
              evaluationOutput.feedbackText,
          });
        }

        let awardedSkillsWithTitles: SkillToUnlock[] = [];
        if (
          evaluationOutput.awardedSkills &&
          evaluationOutput.awardedSkills.length > 0
        ) {
          awardedSkillsWithTitles = await Promise.all(
            evaluationOutput.awardedSkills.map(async (skillKey) => {
              const skillTitle = await fetchSkillTitle(skillKey);
              const status = await fetchSkillStatus(
                skillKey,
                skillTitle,
                localUserId
              );
              return {
                skillKey,
                title: skillTitle,
                isUnlocked: true,
              };
            })
          );
          const skillNames = awardedSkillsWithTitles.map((s) => s.title).join(", ");
          sonnerToast.success(`Skill Unlocked: ${skillNames}`);
        }

        if (evaluationOutput.markLessonAcquired) {
          sonnerToast.success(
            `Lesson Acquired: ${current.trackTitle || current.lessonNodeKey || "this lesson"}`
          );
        }

        if (awardedSkillsWithTitles.length > 0) {
          setSkillToUnlock(awardedSkillsWithTitles[0]);
        }
        setEvaluationState({
          type: "structured",
          evaluationOutput,
          awardedSkillsWithTitles,
        });
      } catch (err) {
        console.error("Failed to evaluate:", err);
      } finally {
        setIsEvaluating(false);
        onClearRecording();
      }
    },
    [
      lesson,
      evaluateMutation,
      debugMode,
      metronomeBpm,
      metronomeTimeSignature,
      localUserId,
      onClearRecording,
      toast,
    ]
  );

  const handleMakeEasier = useCallback(() => {
    const current = lesson;
    if (!current?.lessonRunId) return;
    const newDifficulty = Math.max(1, current.difficulty - 1);
    const evalOutput =
      evaluationState?.type === "structured"
        ? evaluationState.evaluationOutput
        : undefined;
    if (evalOutput?.setupDelta) {
      if (evalOutput.setupDelta.bpm && setMetronomeBpm) {
        setMetronomeBpm(evalOutput.setupDelta.bpm);
      }
      if (evalOutput.setupDelta.meter && setMetronomeTimeSignature) {
        setMetronomeTimeSignature(evalOutput.setupDelta.meter);
      }
      regenerateWithNewSettings(
        evalOutput.setupDelta.bpm ?? metronomeBpm,
        evalOutput.setupDelta.meter ?? metronomeTimeSignature,
        newDifficulty
      );
    } else {
      regenerateWithNewSettings(
        metronomeBpm,
        metronomeTimeSignature,
        newDifficulty
      );
    }
    setEvaluationState(null);
    hasEvaluatedRef.current = false;
  }, [
    lesson,
    evaluationState,
    metronomeBpm,
    metronomeTimeSignature,
    setMetronomeBpm,
    setMetronomeTimeSignature,
    regenerateWithNewSettings,
  ]);

  const handleMakeHarder = useCallback(() => {
    const current = lesson;
    if (!current?.lessonRunId) return;
    const newDifficulty = Math.min(6, current.difficulty + 1);
    const evalOutput =
      evaluationState?.type === "structured"
        ? evaluationState.evaluationOutput
        : undefined;
    if (evalOutput?.setupDelta) {
      if (evalOutput.setupDelta.bpm && setMetronomeBpm) {
        setMetronomeBpm(evalOutput.setupDelta.bpm);
      }
      if (evalOutput.setupDelta.meter && setMetronomeTimeSignature) {
        setMetronomeTimeSignature(evalOutput.setupDelta.meter);
      }
      regenerateWithNewSettings(
        evalOutput.setupDelta.bpm ?? metronomeBpm,
        evalOutput.setupDelta.meter ?? metronomeTimeSignature,
        newDifficulty
      );
    } else {
      regenerateWithNewSettings(
        metronomeBpm,
        metronomeTimeSignature,
        newDifficulty
      );
    }
    setEvaluationState(null);
    hasEvaluatedRef.current = false;
  }, [
    lesson,
    evaluationState,
    metronomeBpm,
    metronomeTimeSignature,
    setMetronomeBpm,
    setMetronomeTimeSignature,
    regenerateWithNewSettings,
  ]);

  const clearEvaluationState = useCallback(() => {
    setEvaluationState(null);
  }, []);

  return {
    lesson,
    isLoading,
    error,
    isEvaluating,
    evaluationState,
    skillToUnlock,
    debugInfo,
    setDebugInfo,
    hasEvaluatedRef,
    evaluateAttempt,
    handleMakeEasier,
    handleMakeHarder,
    clearEvaluationState,
  };
}
