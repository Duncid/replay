import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Play, ArrowRight, Music, Send, Check, X, Minus } from "lucide-react";
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
  isRecording?: boolean;
}

const STREAK_THRESHOLD = 3;

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

// Streak dots component
function StreakDots({ currentStreak }: { currentStreak: number }) {
  const streakComplete = currentStreak >= STREAK_THRESHOLD;
  
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: STREAK_THRESHOLD }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-3 h-3 rounded-full border-2 transition-colors duration-300",
            i < currentStreak
              ? "bg-primary border-primary"
              : "bg-transparent border-muted-foreground/30"
          )}
        />
      ))}
      {streakComplete && (
        <span className="text-lg ml-1 animate-in fade-in zoom-in">🔥</span>
      )}
    </div>
  );
}

export function TunePractice({
  currentNugget,
  currentStreak,
  lastEvaluation,
  onPlaySample,
  onSwitchNugget,
  onLeave,
  isPlaying = false,
  isEvaluating = false,
  isRecording = false,
}: TunePracticeProps) {
  const streakComplete = currentStreak >= STREAK_THRESHOLD;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onLeave}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Leave
        </Button>
        
        <StreakDots currentStreak={currentStreak} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-foreground">{currentNugget.instruction}</p>
          </CardContent>
        </Card>

        {/* Inline Status Area - Playing, Sending, or Evaluation result */}
        <div className="h-10 flex items-center justify-center">
          {isRecording && !isEvaluating ? (
            <div className="flex items-center gap-2 text-primary">
              <Music className="h-4 w-4 animate-pulse" />
              <span className="text-sm font-medium">Playing</span>
            </div>
          ) : isEvaluating ? (
            <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
              <Send className="h-4 w-4" />
              <span className="text-sm font-medium">Sending</span>
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
                Play
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="lg"
            onClick={onSwitchNugget}
            isPulsating={streakComplete}
            className="gap-2"
          >
            Next
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
