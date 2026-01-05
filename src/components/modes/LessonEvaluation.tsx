import { LessonCard, SkillToUnlock } from "@/components/LessonCard";

/**
 * LessonEvaluation - Evaluation phase of the lesson flow
 * 
 * This component represents the evaluation screen where users:
 * - Record their attempt
 * - See evaluation status (recording, evaluating)
 * - Can return to practice mode
 * 
 * Initially wraps LessonCard for backward compatibility, but can be
 * redesigned independently without affecting other lesson flow screens.
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


