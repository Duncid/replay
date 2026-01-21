import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, MinusCircle, RotateCcw, SkipForward, ArrowLeft } from "lucide-react";
import type { TuneEvaluationResponse, PracticePlanItem } from "@/types/tunePractice";
import { useTranslation } from "react-i18next";

interface TuneFeedbackProps {
  evaluation: TuneEvaluationResponse;
  currentNugget: PracticePlanItem;
  hasMoreNuggets: boolean;
  onRetry: () => void;
  onNextNugget: () => void;
  onLeave: () => void;
}

export function TuneFeedback({
  evaluation,
  currentNugget,
  hasMoreNuggets,
  onRetry,
  onNextNugget,
  onLeave,
}: TuneFeedbackProps) {
  const { t } = useTranslation();
  const getEvaluationIcon = () => {
    switch (evaluation.evaluation) {
      case "pass":
        return <CheckCircle2 className="h-12 w-12 text-green-500" />;
      case "close":
        return <MinusCircle className="h-12 w-12 text-yellow-500" />;
      case "fail":
        return <XCircle className="h-12 w-12 text-red-500" />;
    }
  };

  const getEvaluationLabel = () => {
    switch (evaluation.evaluation) {
      case "pass":
        return t("tune.feedback.greatJob");
      case "close":
        return t("tune.feedback.almostThere");
      case "fail":
        return t("tune.feedback.keepPracticing");
    }
  };

  const getEvaluationBadge = () => {
    switch (evaluation.evaluation) {
      case "pass":
        return <Badge className="bg-green-500 text-white">{t("tune.feedback.pass")}</Badge>;
      case "close":
        return <Badge className="bg-yellow-500 text-white">{t("tune.feedback.close")}</Badge>;
      case "fail":
        return <Badge className="bg-red-500 text-white">{t("tune.feedback.tryAgain")}</Badge>;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 space-y-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="flex flex-col items-center gap-3">
            {getEvaluationIcon()}
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">{getEvaluationLabel()}</CardTitle>
              {getEvaluationBadge()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">
              {currentNugget.nugget?.label || currentNugget.itemId}
            </p>
            {evaluation.currentStreak > 0 && (
              <Badge variant="default" className="text-lg px-3 py-1">
                🔥 Streak: {evaluation.currentStreak}
              </Badge>
            )}
          </div>

          <p className="text-foreground text-center">
            {evaluation.feedbackText}
          </p>

          {evaluation.suggestNewNugget && hasMoreNuggets && (
            <div className="bg-primary/10 p-3 rounded-lg text-center">
              <p className="text-sm text-primary font-medium">
                🎉 {t("tune.feedback.masteredPrompt")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={onLeave} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("tune.feedback.leave")}
        </Button>

        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          {t("tune.feedback.practiceAgain")}
        </Button>

        {hasMoreNuggets && (
          <Button 
            onClick={onNextNugget} 
            className="gap-2"
            variant={evaluation.suggestNewNugget ? "default" : "outline"}
          >
            <SkipForward className="h-4 w-4" />
            {t("tune.feedback.nextSection")}
          </Button>
        )}
      </div>
    </div>
  );
}
