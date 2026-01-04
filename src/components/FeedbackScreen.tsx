import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EvaluationOutput } from "@/types/learningSession";
import {
  AlertCircle,
  CheckCircle,
  LogOut,
  RotateCcw,
  Unlock,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SkillToUnlock } from "./LessonCard";

type EvaluationResult = "pass" | "close" | "fail";

interface FeedbackScreenProps {
  evaluation: EvaluationResult;
  feedbackText: string;
  awardedSkills?: SkillToUnlock[];
  onReturnToPractice: () => void;
  onMakeEasier: () => void;
  onMakeHarder: () => void;
  onFinishLesson: () => void;
  debugMode?: boolean;
  evaluationOutput?: EvaluationOutput;
}

export function FeedbackScreen({
  evaluation,
  feedbackText,
  awardedSkills,
  onReturnToPractice,
  onMakeEasier,
  onMakeHarder,
  onFinishLesson,
  debugMode = false,
  evaluationOutput,
}: FeedbackScreenProps) {
  const { t } = useTranslation();

  const getEvaluationConfig = () => {
    switch (evaluation) {
      case "pass":
        return {
          icon: CheckCircle,
          iconColor: "text-green-500",
          bgColor: "bg-green-500/10",
          borderColor: "border-green-500/20",
          title: t("evaluation.passTitle", "Great job!"),
        };
      case "close":
        return {
          icon: AlertCircle,
          iconColor: "text-yellow-500",
          bgColor: "bg-yellow-500/10",
          borderColor: "border-yellow-500/20",
          title: t("evaluation.closeTitle", "Almost there!"),
        };
      case "fail":
        return {
          icon: XCircle,
          iconColor: "text-red-500",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/20",
          title: t("evaluation.failTitle", "Keep practicing!"),
        };
    }
  };

  const config = getEvaluationConfig();
  const Icon = config.icon;
  const isPassing = evaluation === "pass";

  // Debug information
  const skillAwarded = awardedSkills && awardedSkills.length > 0;
  const lessonAcquired = evaluationOutput?.markLessonAcquired ?? false;
  const diagnosis = evaluationOutput?.diagnosis ?? [];
  const evaluationExplanation = evaluationOutput?.feedbackText ?? feedbackText;

  return (
    <Card className="w-full max-w-2xl mx-auto border-border/50 backdrop-blur-sm bg-transparent border-0">
      <CardContent className="pt-6 space-y-4">
        <div
          className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4",
            config.bgColor,
            "border",
            config.borderColor
          )}
        >
          <Icon className={cn("w-8 h-8", config.iconColor)} />
        </div>

        <h2 className="text-center text-xl font-semibold">{config.title}</h2>

        <p className="text-center text-base text-muted-foreground">
          {feedbackText}
        </p>

        {/* Debug Information */}
        {debugMode && evaluationOutput && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-3">
            <div className="font-medium text-sm text-amber-600 dark:text-amber-400 mb-2">
              Debug Information
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-semibold">Skill Awarded:</span>{" "}
                <span
                  className={
                    skillAwarded
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-600 dark:text-gray-400"
                  }
                >
                  {skillAwarded ? "Yes" : "No"}
                </span>
                {skillAwarded && awardedSkills && (
                  <span className="ml-2 text-muted-foreground">
                    ({awardedSkills.map((s) => s.title).join(", ")})
                  </span>
                )}
              </div>

              <div>
                <span className="font-semibold">Lesson Acquired:</span>{" "}
                <span
                  className={
                    lessonAcquired
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-600 dark:text-gray-400"
                  }
                >
                  {lessonAcquired ? "Yes" : "No"}
                </span>
              </div>

              <div>
                <span className="font-semibold">Evaluation:</span>{" "}
                <span className="capitalize">{evaluation}</span>
              </div>

              {diagnosis.length > 0 && (
                <div>
                  <span className="font-semibold">Diagnosis:</span>{" "}
                  <span className="text-muted-foreground">
                    {diagnosis.join(", ")}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-amber-500/20">
                <div className="font-semibold mb-1">Coach Evaluation:</div>
                <div className="text-muted-foreground italic">
                  {evaluationExplanation}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Awarded Skills */}
        {awardedSkills && awardedSkills.length > 0 && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
              <Unlock className="w-4 h-4" />
              <span className="font-medium text-sm">
                {t("evaluation.skillsUnlocked", "Skills Unlocked!")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {awardedSkills.map((skill) => (
                <span
                  key={skill.skillKey}
                  className="bg-green-500/20 text-green-700 dark:text-green-300 px-2 py-1 rounded text-sm"
                >
                  {skill.title}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          {/* Primary action: Return to Practice */}
          <Button onClick={onReturnToPractice} className="w-full gap-2">
            <RotateCcw className="w-4 h-4" />
            {t("evaluation.returnToPractice", "Keep practing")}
          </Button>

          {/* Secondary action: Adjust difficulty */}
          {isPassing ? (
            <Button variant="outline" onClick={onMakeHarder}>
              {t("evaluation.tryHarder", "Try Harder")}
            </Button>
          ) : (
            <Button variant="outline" onClick={onMakeEasier}>
              {t("evaluation.lowerDifficulty", "Lower Difficulty")}
            </Button>
          )}

          {/* Tertiary action: Finish */}
          <Button
            variant="ghost"
            onClick={onFinishLesson}
            className="w-full gap-2 text-muted-foreground"
          >
            <LogOut className="w-4 h-4" />
            {t("evaluation.finishLesson", "Finish Lesson")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
