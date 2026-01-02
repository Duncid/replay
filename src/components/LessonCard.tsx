import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, X, Lock, Unlock, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface SkillToUnlock {
  skillKey: string;
  title: string;
  isUnlocked: boolean;
}

export type LessonMode = "practice" | "evaluation";

interface LessonCardProps {
  instruction: string;
  isEvaluating: boolean;
  isLoading?: boolean;
  mode: LessonMode;
  isRecording?: boolean;
  onPlay: () => void;
  onEvaluate: () => void;
  onLeave: () => void;
  trackTitle?: string;
  skillToUnlock?: SkillToUnlock | null;
}

export function LessonCard({
  instruction,
  isEvaluating,
  isLoading,
  mode,
  isRecording = false,
  onPlay,
  onEvaluate,
  onLeave,
  trackTitle,
  skillToUnlock,
}: LessonCardProps) {
  const { t } = useTranslation();

  // Context display - varies by mode
  const getContext = () => {
    if (mode === "evaluation") {
      // Evaluation mode: show status
      if (isEvaluating) {
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t("learnMode.evaluating", "Evaluating...")}</span>
          </div>
        );
      }
      if (isRecording) {
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t("learnMode.playing", "Playing...")}</span>
          </div>
        );
      }
      return (
        <p className="text-muted-foreground/60 text-sm text-center">
          {t("learnMode.waitingForUser", "Waiting for you to play...")}
        </p>
      );
    }
    // Practice mode: no comment display (moved to EvaluationScreen)
    return null;
  };

  return (
    <Card className="w-full max-w-2xl mx-auto border-border/50 backdrop-blur-sm bg-transparent border-0 relative">
      {/* Top right X button to leave lesson */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onLeave}
        disabled={isLoading || isEvaluating}
        className={cn(
          "absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground",
          "z-10"
        )}
        aria-label={t("learnMode.leaveButton")}
      >
        <X className="h-4 w-4" />
      </Button>
      <CardContent className="pt-6 space-y-4 border-0">
        {/* Track title */}
        {trackTitle && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="text-lg">🎵</span>
            <span>{trackTitle}</span>
          </div>
        )}

        {/* Exercise description */}
        <p className="text-center text-base">{instruction}</p>

        {/* Context - teacher comment (practice) or status (evaluation) */}
        <div className="min-h-[2.5rem] flex items-center justify-center">
          {getContext()}
        </div>

        {/* Skill to unlock */}
        {skillToUnlock && (
          <div className="flex items-center justify-center gap-2 text-sm">
            {skillToUnlock.isUnlocked ? (
              <>
                <Unlock className="w-4 h-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  {skillToUnlock.title}
                </span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t("learnMode.skillToUnlock", "Skill")}: {skillToUnlock.title}
                </span>
              </>
            )}
          </div>
        )}

        {/* Actions - different based on mode */}
        <div className="flex justify-center gap-3 pt-2">
          {mode === "practice" ? (
            // Practice mode actions: Play, Evaluate
            <>
              <Button
                variant="outline"
                onClick={onPlay}
                disabled={isLoading || isEvaluating}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                {t("learnMode.playButton")}
              </Button>
              <Button
                onClick={onEvaluate}
                disabled={isLoading || isEvaluating}
                className="gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {t("learnMode.evaluateButton", "Evaluate")}
              </Button>
            </>
          ) : (
            // Evaluation mode actions: Leave Evaluation
            <Button
              variant="ghost"
              onClick={onLeave}
              disabled={isLoading || isEvaluating}
              className="gap-2 text-muted-foreground"
            >
              <X className="w-4 h-4" />
              {t("learnMode.leaveEvaluation", "Leave Evaluation")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
