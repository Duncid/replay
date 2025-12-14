import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, ArrowRight, X } from "lucide-react";

interface LessonCardProps {
  instruction: string;
  lastComment: string | null;
  isEvaluating: boolean;
  isLoading?: boolean;
  onPlay: () => void;
  onNext: () => void;
  onLeave: () => void;
}

export function LessonCard({
  instruction,
  lastComment,
  isEvaluating,
  isLoading,
  onPlay,
  onNext,
  onLeave,
}: LessonCardProps) {
  return (
    <Card className="w-full max-w-2xl mx-auto border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="pt-6 space-y-4">
        {/* Instruction */}
        <p className="text-lg">{instruction}</p>

        {/* AI Comment or Evaluating indicator */}
        <div className="min-h-[2.5rem] flex items-center justify-center">
          {isEvaluating ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Listening...</span>
            </div>
          ) : lastComment ? (
            <p className="text-muted-foreground italic text-center">{lastComment}</p>
          ) : (
            <p className="text-muted-foreground/60 text-sm text-center">
              Play on the keyboard below
            </p>
          )}
        </div>

        {/* Always visible buttons */}
        <div className="flex justify-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onPlay}
            disabled={isLoading || isEvaluating}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Play
          </Button>
          <Button
            onClick={onNext}
            disabled={isLoading || isEvaluating}
            className="gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Next
          </Button>
          <Button
            variant="ghost"
            onClick={onLeave}
            disabled={isLoading || isEvaluating}
            className="gap-2 text-muted-foreground"
          >
            <X className="w-4 h-4" />
            Leave
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
