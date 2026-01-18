import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { NoteSequence } from "@/types/noteSequence";
import type { PracticePlanItem, TuneEvaluationResponse } from "@/types/tunePractice";
import { ArrowRight, Minus, Music, Play, Send, X } from "lucide-react";
import { useEffect, useState, useRef } from "react";

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

// Status display for top left (Playing, Sending, or Close evaluation)
function StatusDisplay({
  isRecording,
  isEvaluating,
  lastEvaluation,
}: {
  isRecording: boolean;
  isEvaluating: boolean;
  lastEvaluation?: TuneEvaluationResponse | null;
}) {
  if (isRecording && !isEvaluating) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-sm font-medium">Playing</span>
      </div>
    );
  }

  if (isEvaluating) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
        <span className="text-sm font-medium">Sending</span>
      </div>
    );
  }

  // Only show "close" evaluation (pass/fail are shown in streak display)
  if (lastEvaluation?.evaluation === "close") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
        <Minus className="h-4 w-4" />
        <span className="text-sm font-medium">Close</span>
      </div>
    );
  }

  return <div className="min-h-[24px]" />;
}

// Streak display component for bottom left
function StreakDisplay({
  lastEvaluation,
  currentNuggetId,
}: {
  lastEvaluation?: TuneEvaluationResponse | null;
  currentNuggetId: string;
}) {
  const [fires, setFires] = useState<number[]>([]); // Array of unique IDs for fires to enable staggered removal
  const [tempMessage, setTempMessage] = useState<"success" | "woops" | "Close!" | null>(null);
  const [messageVisible, setMessageVisible] = useState(false);
  const [isRemovingFires, setIsRemovingFires] = useState(false);
  const nextFireIdRef = useRef(0);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  // Reset on nugget change
  useEffect(() => {
    // Clear all timeouts
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];

    setFires([]);
    setTempMessage(null);
    setMessageVisible(false);
    setIsRemovingFires(false);
  }, [currentNuggetId]);

  // Handle evaluation changes
  useEffect(() => {
    if (!lastEvaluation) {
      return;
    }

    // Clear any existing timeouts
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];

    const evaluation = lastEvaluation.evaluation;

    if (evaluation === "pass") {
      // Success: show "success", then add fire after 2s
      setTempMessage("success");
      // Trigger fade-in after a tiny delay to ensure transition
      const fadeInTimer = setTimeout(() => {
        setMessageVisible(true);
      }, 10);
      timeoutRefs.current.push(fadeInTimer);

      const timer = setTimeout(() => {
        const fireId = nextFireIdRef.current++;
        setFires((prev) => [...prev, fireId]);
        setTempMessage(null);
        setMessageVisible(false);
      }, 2000);

      timeoutRefs.current.push(timer);
    } else if (evaluation === "fail") {
      // Fail: show "woops", then remove fires one by one
      setTempMessage("woops");
      const fadeInTimer = setTimeout(() => {
        setMessageVisible(true);
      }, 10);
      timeoutRefs.current.push(fadeInTimer);

      // Get current fires to schedule removal
      setFires((currentFires) => {
        if (currentFires.length === 0) {
          // If no fires, just hide message after showing
          const timer = setTimeout(() => {
            setTempMessage(null);
            setMessageVisible(false);
          }, 2000);
          timeoutRefs.current.push(timer);
        } else {
          // Remove fires one by one with 500ms delay
          setIsRemovingFires(true);
          const firesCopy = [...currentFires];
          firesCopy.forEach((fireId, index) => {
            const timer = setTimeout(
              () => {
                setFires((prev) => {
                  const updated = prev.filter((id) => id !== fireId);
                  if (index === firesCopy.length - 1) {
                    // Last fire removed
                    setIsRemovingFires(false);
                    setTempMessage(null);
                    setMessageVisible(false);
                  }
                  return updated;
                });
              },
              (index + 1) * 500,
            );
            timeoutRefs.current.push(timer);
          });
        }
        return currentFires; // Return unchanged for now, removal happens in timeouts
      });
    } else if (evaluation === "close") {
      // Close: show "Close!" but don't change fires
      setTempMessage("Close!");
      const fadeInTimer = setTimeout(() => {
        setMessageVisible(true);
      }, 10);
      timeoutRefs.current.push(fadeInTimer);

      const timer = setTimeout(() => {
        setTempMessage(null);
        setMessageVisible(false);
      }, 2000);

      timeoutRefs.current.push(timer);
    }

    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current = [];
    };
  }, [lastEvaluation]);

  return (
    <div className="flex flex-1 items-center gap-2 min-h-[24px] s-px-3">
      {/* Fires */}
      {fires.map((fireId, index) => (
        <span
          key={fireId}
          className={cn("text-lg transition-opacity duration-300", isRemovingFires ? "opacity-0" : "opacity-100")}
          style={{
            transitionDelay: isRemovingFires ? `${index * 500}ms` : "0ms",
          }}
        >
          🔥
        </span>
      ))}

      {/* Temporary message */}
      {tempMessage && (
        <span
          className={cn(
            "text-sm font-medium transition-opacity duration-300",
            messageVisible ? "opacity-100" : "opacity-0",
            tempMessage === "success" && "text-green-600",
            tempMessage === "woops" && "text-orange-600",
            tempMessage === "Close!" && "text-accent",
          )}
        >
          {tempMessage}
        </span>
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
  const [shouldPulse, setShouldPulse] = useState(false);
  const [pulsedStreak, setPulsedStreak] = useState<number | null>(null);

  // Get sample sequence from either nugget or assembly
  const sampleSequence = (currentNugget.nugget?.noteSequence || currentNugget.assembly?.noteSequence) as
    | NoteSequence
    | undefined;

  useEffect(() => {
    // Reset pulse state when streak is not complete
    if (!streakComplete) {
      setShouldPulse(false);
      setPulsedStreak(null);
      return;
    }

    // Only trigger pulse once when streak first reaches threshold
    // If streak drops and comes back, we can pulse again
    if (pulsedStreak !== STREAK_THRESHOLD && currentStreak >= STREAK_THRESHOLD) {
      setShouldPulse(true);
      setPulsedStreak(STREAK_THRESHOLD);
      const timer = setTimeout(() => setShouldPulse(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [streakComplete, currentStreak, pulsedStreak]);

  const handleNextNugget = () => {
    setShouldPulse(false);
    setPulsedStreak(null);
    onSwitchNugget();
  };

  return (
    <div className="flex flex-col h-full items-center justify-center p-6">
      <Card className="w-full max-w-lg relative">
        <CardHeader className="flex flex-row pb-4 justify-between items-center">
          <StatusDisplay isRecording={isRecording} isEvaluating={isEvaluating} lastEvaluation={lastEvaluation} />
          <Button variant="ghost" size="icon" onClick={onLeave}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 p-4">
          {/* Instruction */}
          <p className="text-foreground text-center px-3">{currentNugget.instruction}</p>

          {/* Sheet music and Play button */}
          <div className="flex flex-col items-center gap-1">
            {sampleSequence?.notes?.length ? (
              <div className="flex justify-center">
                <SheetMusic sequence={sampleSequence} compact noTitle noControls hasColor scale={1.1} />
              </div>
            ) : null}

            {/* Play button visually attached to sheet */}
            <Button variant="ghost" onClick={onPlaySample} disabled={isPlaying} className="gap-2">
              <Play fill="currentColor" stroke="none" />
              Replay
            </Button>
          </div>

          {/* Bottom section: StreakDisplay left, Next button right */}
          <div className="flex items-center justify-between">
            {/* Streak display bottom left */}
            <StreakDisplay lastEvaluation={lastEvaluation} currentNuggetId={currentNugget.itemId} />

            {/* Next button bottom right */}
            <Button
              variant={shouldPulse ? "default" : "ghost"}
              onClick={handleNextNugget}
              isPulsating={shouldPulse}
              className="gap-2"
            >
              Next
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
