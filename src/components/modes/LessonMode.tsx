import { DebugLLMSheet } from "@/components/DebugLLMSheet";
import { EvaluationDebugSheet } from "@/components/EvaluationDebugSheet";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { LessonPractice } from "@/components/modes/LessonPractice";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLessonSession } from "@/hooks/useLessonSession";
import type { NoteSequence } from "@/types/noteSequence";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface LessonModeProps {
  lessonKey: string;
  onLeave: () => void;
  onLoadingChange?: (loading: boolean) => void;
  isPlaying: boolean;
  onPlaySequence: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  isRecording: boolean;
  userRecording: NoteSequence | null;
  onClearRecording: () => void;
  onCompleteRecordingNow?: () => void;
  language: string;
  notationPreference?: "auto" | "abc" | "solfege";
  debugMode: boolean;
  localUserId?: string | null;
  metronomeBpm: number;
  metronomeTimeSignature: string;
  setMetronomeBpm?: (bpm: number) => void;
  setMetronomeTimeSignature?: (ts: string) => void;
  applyMetronomeSettings: (settings?: { bpm?: number; timeSignature?: string; isActive?: boolean; feel?: unknown; soundType?: unknown }) => void;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (
    handler: ((noteKey: string) => void) | null,
  ) => void;
  showLessonSheet: boolean;
  setShowLessonSheet: (open: boolean) => void;
  showEvalSheet: boolean;
  setShowEvalSheet: (open: boolean) => void;
  showLessonInfoSheet: boolean;
  setShowLessonInfoSheet: (open: boolean) => void;
}

export function LessonMode({
  lessonKey,
  onLeave,
  onLoadingChange,
  isPlaying,
  onPlaySequence,
  onStopPlayback,
  isRecording,
  userRecording,
  onClearRecording,
  onCompleteRecordingNow,
  language,
  notationPreference,
  debugMode,
  localUserId,
  metronomeBpm,
  metronomeTimeSignature,
  setMetronomeBpm,
  setMetronomeTimeSignature,
  applyMetronomeSettings,
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
  showLessonSheet,
  setShowLessonSheet,
  showEvalSheet,
  setShowEvalSheet,
  showLessonInfoSheet,
  setShowLessonInfoSheet,
}: LessonModeProps) {
  const { t } = useTranslation();

  const session = useLessonSession(lessonKey, {
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
  });

  const {
    lesson,
    isLoading,
    error,
    isEvaluating,
    evaluationState,
    skillToUnlock,
    debugInfo,
    hasEvaluatedRef,
    evaluateAttempt,
    handleMakeEasier,
    handleMakeHarder,
    clearEvaluationState,
  } = session;

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (
      !lesson ||
      !userRecording ||
      userRecording.notes.length === 0 ||
      isRecording ||
      hasEvaluatedRef.current ||
      isEvaluating
    ) {
      return;
    }
    hasEvaluatedRef.current = true;
    evaluateAttempt(userRecording);
  }, [
    lesson,
    userRecording,
    isRecording,
    isEvaluating,
    evaluateAttempt,
  ]);

  const handlePlay = useCallback(() => {
    if (lesson && lesson.targetSequence.notes.length > 0) {
      onPlaySequence(lesson.targetSequence);
    }
  }, [lesson, onPlaySequence]);

  const handleReturnToPractice = useCallback(() => {
    onClearRecording();
    hasEvaluatedRef.current = false;
    clearEvaluationState();
  }, [onClearRecording, clearEvaluationState]);

  if (isLoading) {
    return (
      <LoadingSpinner message={t("learnMode.generatingLesson")} />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <p className="text-destructive mb-4">{error}</p>
        <button onClick={onLeave} className="text-primary hover:underline">
          {t("tune.returnToSelection")}
        </button>
      </div>
    );
  }

  if (!lesson) {
    return null;
  }

  const evaluationFeedback =
    evaluationState?.type === "structured"
      ? {
          evaluation: evaluationState.evaluationOutput.evaluation,
          feedbackText: evaluationState.evaluationOutput.feedbackText,
          awardedSkills: evaluationState.awardedSkillsWithTitles,
        }
      : null;

  return (
    <>
      <div className="w-full h-full min-h-0 flex flex-col">
        <LessonPractice
          instruction={lesson.instruction}
          targetSequence={lesson.targetSequence}
          isPlaying={isPlaying}
          isLoading={isPlaying}
          isEvaluating={isEvaluating}
          isRecording={isRecording}
          evaluationFeedback={evaluationFeedback}
          onPlay={handlePlay}
          onStopPlayback={onStopPlayback}
          onPlayheadReachedEnd={onCompleteRecordingNow}
          onLeave={onLeave}
          onDismissFeedback={handleReturnToPractice}
          onMakeEasier={() => {
            clearEvaluationState();
            handleMakeEasier();
          }}
          onMakeHarder={() => {
            clearEvaluationState();
            handleMakeHarder();
          }}
          onRegisterNoteHandler={onRegisterNoteHandler}
          onRegisterNoteOffHandler={onRegisterNoteOffHandler}
          trackTitle={lesson.trackTitle}
          skillToUnlock={skillToUnlock}
          debugMode={debugMode}
          difficulty={lesson.difficulty}
        />
      </div>
      {debugMode && (
        <>
          <DebugLLMSheet
            title="Lesson Generation LLM Call"
            open={showLessonSheet}
            onOpenChange={setShowLessonSheet}
            debugCall={debugInfo.lessonGeneration}
          />
          <EvaluationDebugSheet
            title="Last Evaluation"
            open={showEvalSheet}
            onOpenChange={setShowEvalSheet}
            debugCall={debugInfo.evaluation}
            evaluationOutput={
              evaluationState?.type === "structured"
                ? evaluationState.evaluationOutput
                : undefined
            }
            awardedSkills={
              evaluationState?.type === "structured"
                ? evaluationState.awardedSkillsWithTitles
                : undefined
            }
          />
          <Sheet
            open={showLessonInfoSheet}
            onOpenChange={setShowLessonInfoSheet}
          >
            <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
              <SheetHeader>
                <SheetTitle>Lesson info</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                {typeof lesson.difficulty === "number" && (
                  <p>
                    <span className="font-medium text-muted-foreground">
                      Difficulty:
                    </span>{" "}
                    {lesson.difficulty}
                  </p>
                )}
                {skillToUnlock && (
                  <p>
                    <span className="font-medium text-muted-foreground">
                      Skill:
                    </span>{" "}
                    {skillToUnlock.skillKey}
                    {skillToUnlock.title
                      ? ` (${skillToUnlock.title})`
                      : ""}
                  </p>
                )}
                {lesson.trackTitle && (
                  <p>
                    <span className="font-medium text-muted-foreground">
                      Track:
                    </span>{" "}
                    {lesson.trackTitle}
                  </p>
                )}
                {typeof lesson.difficulty !== "number" &&
                  !skillToUnlock &&
                  !lesson.trackTitle && (
                    <p className="text-muted-foreground">
                      No lesson info available.
                    </p>
                  )}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </>
  );
}
