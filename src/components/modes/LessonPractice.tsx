import { LessonCard, SkillToUnlock } from "@/components/LessonCard";

/**
 * LessonPractice - Practice phase of the lesson flow
 * 
 * This component represents the practice screen where users can:
 * - Play the demo sequence
 * - Switch to evaluation mode
 * 
 * Initially wraps LessonCard for backward compatibility, but can be
 * redesigned independently without affecting other lesson flow screens.
 */
interface LessonPracticeProps {
  instruction: string;
  isLoading?: boolean;
  onPlay: () => void;
  onStartEvaluation: () => void;
  onLeave: () => void;
  trackTitle?: string;
  skillToUnlock?: SkillToUnlock | null;
  debugMode?: boolean;
  difficulty?: number;
}

export function LessonPractice({
  instruction,
  isLoading,
  onPlay,
  onStartEvaluation,
  onLeave,
  trackTitle,
  skillToUnlock,
  debugMode = false,
  difficulty,
}: LessonPracticeProps) {
  return (
    <LessonCard
      instruction={instruction}
      isEvaluating={false}
      isLoading={isLoading}
      mode="practice"
      isRecording={false}
      onPlay={onPlay}
      onEvaluate={onStartEvaluation}
      onLeave={onLeave}
      trackTitle={trackTitle}
      skillToUnlock={skillToUnlock}
      debugMode={debugMode}
      difficulty={difficulty}
    />
  );
}


