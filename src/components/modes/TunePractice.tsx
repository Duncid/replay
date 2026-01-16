import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Play, SkipForward, Music, Loader2 } from "lucide-react";
import type { PracticePlanItem } from "@/types/tunePractice";

interface TunePracticeProps {
  tuneTitle: string;
  currentNugget: PracticePlanItem;
  currentIndex: number;
  totalNuggets: number;
  currentStreak: number;
  onPlaySample: () => void;
  onSwitchNugget: () => void;
  onLeave: () => void;
  isPlaying?: boolean;
  isEvaluating?: boolean;
}

export function TunePractice({
  tuneTitle,
  currentNugget,
  currentIndex,
  totalNuggets,
  currentStreak,
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
            <Badge variant="default" className="text-sm">
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

        {/* Evaluating Status - shown only when about to evaluate */}
        {isEvaluating && (
          <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Evaluating...</span>
          </div>
        )}

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
