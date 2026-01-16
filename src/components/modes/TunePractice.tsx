import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Play, SkipForward, Music, Loader2, Check, X, Minus } from "lucide-react";
import type { PracticePlanItem, TuneEvaluationResponse } from "@/types/tunePractice";
import { cn } from "@/lib/utils";

interface TunePracticeProps {
  tuneTitle: string;
  currentNugget: PracticePlanItem;
  currentIndex: number;
  totalNuggets: number;
  currentStreak: number;
  lastEvaluation?: TuneEvaluationResponse | null;
  onPlaySample: () => void;
  onSwitchNugget: () => void;
  onLeave: () => void;
  isPlaying?: boolean;
  isEvaluating?: boolean;
}

// Inline evaluation badge that fades after display
function EvaluationBadge({ evaluation }: { evaluation: TuneEvaluationResponse }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [evaluation]);

  if (!visible) return null;

  const config = {
    pass: { icon: Check, className: "bg-green-500/20 text-green-600 border-green-500/30" },
    close: { icon: Minus, className: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30" },
    fail: { icon: X, className: "bg-red-500/20 text-red-600 border-red-500/30" },
  };

  const { icon: Icon, className } = config[evaluation.evaluation];

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border transition-opacity duration-500",
      className,
      !visible && "opacity-0"
    )}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium capitalize">{evaluation.evaluation}</span>
    </div>
  );
}

export function TunePractice({
  tuneTitle,
  currentNugget,
  currentIndex,
  totalNuggets,
  currentStreak,
  lastEvaluation,
  onPlaySample,
  onSwitchNugget,
  onLeave,
  isPlaying = false,
  isEvaluating = false,
}: TunePracticeProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onLeave}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Leave
        </Button>
        
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">{tuneTitle}</h2>
          <p className="text-sm text-muted-foreground">
            Section {currentIndex + 1} of {totalNuggets}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentStreak > 0 && (
            <Badge variant="default" className="text-sm animate-in fade-in duration-300">
              🔥 {currentStreak}
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <Card className="w-full max-w-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{currentNugget.nugget.label}</CardTitle>
              <Badge variant="outline">{currentNugget.nuggetId}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground">{currentNugget.instruction}</p>
            
            {currentNugget.nugget.teacherHints?.goal && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Goal: </span>
                  {currentNugget.nugget.teacherHints.goal}
                </p>
              </div>
            )}

            {currentNugget.motifs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {currentNugget.motifs.map((motif) => (
                  <Badge key={motif} variant="secondary" className="text-xs">
                    {motif}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inline Status Area - Evaluation result or loading indicator */}
        <div className="h-10 flex items-center justify-center">
          {isEvaluating ? (
            <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Evaluating...</span>
            </div>
          ) : lastEvaluation ? (
            <EvaluationBadge evaluation={lastEvaluation} />
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onPlaySample}
            disabled={isPlaying}
            className="gap-2"
          >
            {isPlaying ? (
              <>
                <Music className="h-5 w-5 animate-pulse" />
                Playing...
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Play Sample
              </>
            )}
          </Button>

          {totalNuggets > 1 && (
            <Button
              variant="ghost"
              size="lg"
              onClick={onSwitchNugget}
              className="gap-2"
            >
              <SkipForward className="h-5 w-5" />
              Next Section
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Play the section on your piano. Recording will stop automatically when you pause.
        </p>
      </div>
    </div>
  );
}
