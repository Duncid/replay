import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LessonPhase } from "@/types/learningSession";
import { CheckCircle2, Circle, Loader2, Play, RotateCcw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonCardProps {
  instruction: string;
  phase: LessonPhase;
  attempts: number;
  validations: number;
  feedback: string | null;
  isLoading?: boolean;
  onPlayDemo: () => void;
  onTryAgain: () => void;
  onNext: () => void;
}

export function LessonCard({
  instruction,
  phase,
  attempts,
  validations,
  feedback,
  isLoading,
  onPlayDemo,
  onTryAgain,
  onNext,
}: LessonCardProps) {
  const getPhaseBadge = () => {
    switch (phase) {
      case "demo":
        return (
          <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
            <Play className="w-3 h-3 mr-1" />
            Watch & Listen
          </Badge>
        );
      case "your_turn":
        return (
          <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 border-amber-500/30">
            Your Turn
          </Badge>
        );
      case "evaluating":
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Evaluating...
          </Badge>
        );
      case "feedback":
        return (
          <Badge variant="secondary" className={cn(
            validations >= 3 
              ? "bg-green-500/20 text-green-600 border-green-500/30"
              : "bg-blue-500/20 text-blue-600 border-blue-500/30"
          )}>
            {validations >= 3 ? "Completed!" : "Feedback"}
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderValidationDots = () => (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center">
          {i < validations ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground/40" />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Card className="w-full max-w-2xl mx-auto border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          {getPhaseBadge()}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Progress:</span>
            {renderValidationDots()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instruction */}
        <p className="text-lg">{instruction}</p>

        {/* Your Turn indicator */}
        {phase === "your_turn" && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
            <p className="text-amber-600 font-medium">
              Play the sequence on the keyboard below
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Attempt {attempts + 1}
            </p>
          </div>
        )}

        {/* Feedback */}
        {phase === "feedback" && feedback && (
          <div className={cn(
            "rounded-lg p-4 text-center",
            validations >= 3 
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-blue-500/10 border border-blue-500/20"
          )}>
            <p className={cn(
              "font-medium",
              validations >= 3 ? "text-green-600" : "text-blue-600"
            )}>
              {feedback}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3 pt-2">
          {(phase === "demo" || phase === "feedback") && validations < 3 && (
            <Button
              variant="outline"
              onClick={onPlayDemo}
              disabled={isLoading}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              {phase === "demo" ? "Play Demo" : "Hear Again"}
            </Button>
          )}

          {phase === "feedback" && validations < 3 && (
            <Button
              onClick={onTryAgain}
              disabled={isLoading}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Try Again
            </Button>
          )}

          {validations >= 3 && (
            <Button
              onClick={onNext}
              disabled={isLoading}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <ArrowRight className="w-4 h-4" />
              Next Challenge
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
