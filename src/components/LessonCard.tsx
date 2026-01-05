import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowBigRightDashIcon,
  ArrowLeft,
  AudioLines,
  Loader2,
  Play,
} from "lucide-react";
import { useTranslation } from "react-i18next";

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
  debugMode?: boolean;
  difficulty?: number;
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
  debugMode = false,
  difficulty,
}: LessonCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "w-full max-w-2xl min-h-[360px] mx-auto rounded-3xl px-6 pt-6 pb-6 relative transition-all duration-300 ease-in-out",
        mode === "evaluation" ? "bg-accent" : "bg-transparent"
      )}
    >
      <div className="space-y-8 h-full justify-center">
        <div className="flex items-center">
          {mode === "practice" ? (
            /* Practice mode: Leave button */
            <Button
              variant="ghost"
              size="sm"
              onClick={onLeave}
              disabled={isLoading || isEvaluating}
              aria-label={t("learnMode.leaveButton")}
            >
              <ArrowLeft className="h-4 w-4" />
              Leave
            </Button>
          ) : (
            /* Evaluation mode: Back button */
            <Button
              variant="ghost"
              size="sm"
              onClick={onEvaluate}
              disabled={isLoading || isEvaluating}
            >
              <ArrowLeft />
              {t("learnMode.backToPractice", "Back")}
            </Button>
          )}
        </div>
        {mode === "practice" ? (
          /* Practice Mode */
          <>
            {/* Exercise description */}
            <p className="text-center text-base">{instruction}</p>
            {/* Practice buttons */}
            <div className="flex gap-2 items-center justify-center">
              <Button
                onClick={onPlay}
                variant="outline"
                disabled={isLoading || isEvaluating}
                size="play"
              >
                <Play fill="currentColor" stroke="none" />
              </Button>
              <Button
                onClick={onEvaluate}
                disabled={isLoading || isEvaluating}
                size="play"
              >
                <ArrowBigRightDashIcon
                  fill="currentColor"
                  stroke="currentColor"
                />
              </Button>
            </div>
          </>
        ) : (
          /* Evaluation Mode */
          <>
            {/* Evaluation status */}
            <div className="min-h-[2.5rem] flex flex-col gap-4 items-center justify-center text-amber-900">
              <AudioLines className="w-12 h-12" />
              {isEvaluating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-base">
                    {t("learnMode.evaluating", "Evaluating...")}
                  </span>
                </div>
              ) : isRecording ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-base">
                    {t("learnMode.playing", "Playing...")}
                  </span>
                </div>
              ) : (
                <p className="text-base text-center">
                  {t("learnMode.waitingForUser", "Waiting for you to play...")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {/* Debug bar - shows difficulty and skill info when debug mode is active */}
      {debugMode && (
        <div className="rounded-lg mt-12 px-4 py-2 bg-amber-500">
          <div className="flex items-center justify-center gap-4 text-xs text-amber-950">
            {typeof difficulty === "number" && (
              <span>Difficulty: {difficulty}</span>
            )}
            {skillToUnlock && (
              <span>
                Skill: {skillToUnlock.skillKey}
                {skillToUnlock.title && ` (${skillToUnlock.title})`}
              </span>
            )}
            {typeof difficulty !== "number" &&
              !skillToUnlock &&
              "No debug info available"}
          </div>
        </div>
      )}
    </div>
  );
}
