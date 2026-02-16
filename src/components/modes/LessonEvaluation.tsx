import { LessonCard, SkillToUnlock } from "@/components/LessonCard";

/**
 * LessonEvaluation - Evaluation phase of the lesson flow
 *
 * @deprecated No longer rendered. Practice and evaluation are unified in
 * LessonPractice (Pixi view + overlay + playhead). This component is kept
 * for reference or potential reuse of LessonCard in other flows.
 *
 * Previously: evaluation screen where users record, see status, return to practice.
 */
interface LessonEvaluationProps {
  instruction: string;
  isEvaluating: boolean;
  isLoading?: boolean;
  isRecording?: boolean;
  onBackToPractice: () => void;
  onLeave: () => void;
  trackTitle?: string;
  skillToUnlock?: SkillToUnlock | null;
  debugMode?: boolean;
  difficulty?: number;
}

export function LessonEvaluation({
  instruction,
  isEvaluating,
  isLoading,
  isRecording = false,
  onBackToPractice,
  onLeave,
  trackTitle,
  skillToUnlock,
  debugMode = false,
  difficulty,
}: LessonEvaluationProps) {
  return (
    <LessonCard
      instruction={instruction}
      isEvaluating={isEvaluating}
      isLoading={isLoading}
      mode="evaluation"
      isRecording={isRecording}
      onPlay={() => {}} // Not used in evaluation mode
      onEvaluate={onBackToPractice}
      onLeave={onLeave}
      trackTitle={trackTitle}
      skillToUnlock={skillToUnlock}
      debugMode={debugMode}
      difficulty={difficulty}
    />
  );
}


