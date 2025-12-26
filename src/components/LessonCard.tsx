import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, ArrowRight, X, Lock, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface SkillToUnlock {
  skillKey: string;
  title: string;
  isUnlocked: boolean;
}

interface LessonCardProps {
  instruction: string;
  lastComment: string | null;
  isEvaluating: boolean;
  isLoading?: boolean;
  onPlay: () => void;
  onNext: () => void;
  onLeave: () => void;
  trackTitle?: string;
  skillToUnlock?: SkillToUnlock | null;
}

export function LessonCard({
  instruction,
  lastComment,
  isEvaluating,
  isLoading,
  onPlay,
  onNext,
  onLeave,
  trackTitle,
  skillToUnlock,
}: LessonCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="w-full max-w-2xl mx-auto border-border/50 backdrop-blur-sm bg-transparent border-0">
      <CardContent className="pt-6 space-y-4 border-0">
        {/* Track title */}
        {trackTitle && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="text-lg">🎵</span>
            <span>{trackTitle}</span>
          </div>
        )}

        {/* Instruction */}
        <p className="text-center text-base">{instruction}</p>

        {/* AI Comment or Evaluating indicator */}
        <div className="min-h-[2.5rem] flex items-center justify-center">
          {isEvaluating ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t("learnMode.listening")}</span>
            </div>
          ) : lastComment ? (
            <p className="text-muted-foreground italic text-center text-lg font-sans">
              {lastComment}
            </p>
          ) : (
            <p className="text-muted-foreground/60 text-sm text-center">
              {t("learnMode.waitingForUser")}
            </p>
          )}
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

        {/* Always visible buttons */}
        <div className="flex justify-center gap-3 pt-2">
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
            onClick={onNext}
            disabled={isLoading || isEvaluating}
            className="gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            {t("learnMode.nextButton")}
          </Button>
          <Button
            variant="ghost"
            onClick={onLeave}
            disabled={isLoading || isEvaluating}
            className="gap-2 text-muted-foreground"
          >
            <X className="w-4 h-4" />
            {t("learnMode.leaveButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
