import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { NoteSequence } from "@/types/noteSequence";
import type { PracticePlanItem, TuneEvaluationResponse } from "@/types/tunePractice";
import { ArrowLeft, ArrowRight, Minus, Play, X, List } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface TunePracticeProps {
  tuneTitle: string;
  currentNugget: PracticePlanItem;
  currentIndex: number;
  totalNuggets: number;
  currentStreak: number;
  lastEvaluation?: TuneEvaluationResponse | null;
  onPlaySample: () => void;
  onSwitchNugget: () => void;
  onPreviousNugget: () => void;
  onLeave: () => void;
  isPlaying?: boolean;
  isEvaluating?: boolean;
  isRecording?: boolean;
  debugMode?: boolean;
  practicePlan?: PracticePlanItem[];
}

const STREAK_THRESHOLD = 3;

// Status display for top left (Playing, Sending, or Close evaluation)
function StatusDisplay({
  isRecording,
  isEvaluating,
  lastEvaluation,
  labels,
}: {
  isRecording: boolean;
  isEvaluating: boolean;
  lastEvaluation?: TuneEvaluationResponse | null;
  labels: { playing: string; sending: string; close: string };
}) {
  if (isRecording && !isEvaluating) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-sm font-medium">{labels.playing}</span>
      </div>
    );
  }

  if (isEvaluating) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
        <span className="text-sm font-medium">{labels.sending}</span>
      </div>
    );
  }

  // Only show "close" evaluation (pass/fail are shown in streak display)
  if (lastEvaluation?.evaluation === "close") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
        <Minus className="h-4 w-4" />
        <span className="text-sm font-medium">{labels.close}</span>
      </div>
    );
  }

  return <div className="min-h-[24px]" />;
}

// Streak display component for bottom left
function StreakDisplay({
  lastEvaluation,
  currentNuggetId,
  messages,
}: {
  lastEvaluation?: TuneEvaluationResponse | null;
  currentNuggetId: string;
  messages: { success: string; fail: string; close: string };
}) {
  const [fires, setFires] = useState<number[]>([]); // Array of unique IDs for fires to enable staggered removal
  const [tempMessage, setTempMessage] = useState<"success" | "fail" | "close" | null>(null);
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
      const successCount = Math.max(1, lastEvaluation.successCount ?? 1);
      // Success: show "success", then add fire(s)
      setTempMessage("success");
      // Trigger fade-in after a tiny delay to ensure transition
      const fadeInTimer = setTimeout(() => {
        setMessageVisible(true);
      }, 10);
      timeoutRefs.current.push(fadeInTimer);

      const initialDelay = 1200;
      const fireDelay = 350;
      for (let i = 0; i < successCount; i += 1) {
        const timer = setTimeout(() => {
          const fireId = nextFireIdRef.current++;
          setFires((prev) => [...prev, fireId]);
          if (i === successCount - 1) {
            setTempMessage(null);
            setMessageVisible(false);
          }
        }, initialDelay + i * fireDelay);
        timeoutRefs.current.push(timer);
      }
    } else if (evaluation === "fail") {
      // Fail: show "woops", then remove fires one by one
      setTempMessage("fail");
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
      setTempMessage("close");
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
            tempMessage === "fail" && "text-orange-600",
            tempMessage === "close" && "text-accent",
          )}
        >
          {tempMessage === "success"
            ? messages.success
            : tempMessage === "fail"
              ? messages.fail
              : messages.close}
        </span>
      )}
    </div>
  );
}

export function TunePractice({
  currentNugget,
  currentIndex,
  currentStreak,
  lastEvaluation,
  onPlaySample,
  onSwitchNugget,
  onPreviousNugget,
  onLeave,
  isPlaying = false,
  isEvaluating = false,
  isRecording = false,
  debugMode = false,
  practicePlan = [],
}: TunePracticeProps) {
  const { t } = useTranslation();
  const streakComplete = currentStreak >= STREAK_THRESHOLD;
  const [shouldPulse, setShouldPulse] = useState(false);
  const [pulsedStreak, setPulsedStreak] = useState<number | null>(null);
  const [showPlanSheet, setShowPlanSheet] = useState(false);
  const [commentKey, setCommentKey] = useState(0);
  const isFirstNugget = currentIndex === 0;
  const statusLabels = {
    playing: t("tune.status.playing"),
    sending: t("tune.status.sending"),
    close: t("tune.status.close"),
  };
  const streakMessages = {
    success: t("tune.feedback.greatJob"),
    fail: t("tune.feedback.keepPracticing"),
    close: t("tune.feedback.almostThere"),
  };

  // Get sample sequence from nugget, assembly, or full tune
  const sampleSequence = (
    currentNugget.nugget?.noteSequence || 
    currentNugget.assembly?.noteSequence || 
    currentNugget.fullTune?.noteSequence
  ) as NoteSequence | undefined;

  const commentText = lastEvaluation?.feedbackText ?? t("tune.comments.placeholder");
  const evaluationLabel = lastEvaluation
    ? lastEvaluation.evaluation === "pass"
      ? t("tune.feedback.pass")
      : lastEvaluation.evaluation === "close"
        ? t("tune.feedback.close")
        : t("tune.feedback.tryAgain")
    : null;

  useEffect(() => {
    setCommentKey((prev) => prev + 1);
  }, [lastEvaluation?.feedbackText]);

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
      <div className="flex w-full max-w-5xl flex-col gap-4 lg:flex-row lg:items-stretch">
        <Card className="w-full flex-[2] relative">
          <CardHeader className="flex flex-row pb-4 justify-between items-center">
            <StatusDisplay
              isRecording={isRecording}
              isEvaluating={isEvaluating}
              lastEvaluation={lastEvaluation}
              labels={statusLabels}
            />
            <div className="flex items-center gap-2">
              {debugMode && practicePlan.length > 0 && (
                <Sheet open={showPlanSheet} onOpenChange={setShowPlanSheet}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" title="View Practice Plan">
                      <List className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
                    <SheetHeader>
                      <SheetTitle>Practice Plan</SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                      <div className="space-y-4 pr-4">
                        {practicePlan.map((item, index) => {
                          const isCurrent = index === currentIndex;
                          const itemTypeLabel = 
                            item.itemType === 'nugget' ? 'Nugget' :
                            item.itemType === 'assembly' ? 'Assembly' :
                            'Full Tune';
                          
                          return (
                            <div
                              key={`${item.itemId}-${index}`}
                              className={cn(
                                "p-4 rounded-lg border",
                                isCurrent 
                                  ? "border-primary bg-primary/5" 
                                  : "border-border bg-muted/30"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono text-muted-foreground">
                                    {index + 1}.
                                  </span>
                                  <span className="font-medium font-mono text-sm">
                                    {item.itemId}
                                  </span>
                                  <Badge 
                                    variant={isCurrent ? "default" : "outline"}
                                    className="text-xs"
                                  >
                                    {itemTypeLabel}
                                  </Badge>
                                  {isCurrent && (
                                    <Badge variant="default" className="text-xs">
                                      Current
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-foreground mb-2">
                                {item.instruction}
                              </p>
                              {item.motifs && item.motifs.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  <span className="text-xs text-muted-foreground">Motifs:</span>
                                  {item.motifs.map((motif) => (
                                    <Badge 
                                      key={motif} 
                                      variant="secondary" 
                                      className="text-xs"
                                    >
                                      {motif}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              )}
              <Button variant="ghost" size="icon" onClick={onLeave}>
                <X />
              </Button>
            </div>
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
                {t("tune.buttons.replay")}
              </Button>
            </div>

            {/* Bottom section: StreakDisplay left, Previous/Next buttons right */}
            <div className="flex items-center justify-between">
              {/* Streak display bottom left */}
              <StreakDisplay
                lastEvaluation={lastEvaluation}
                currentNuggetId={currentNugget.itemId}
                messages={streakMessages}
              />

              {/* Next button bottom right */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={onPreviousNugget}
                  className="gap-2"
                  disabled={isFirstNugget}
                >
                  <ArrowLeft className="h-5 w-5" />
                  {t("tune.buttons.previous")}
                </Button>
                <Button
                  variant={shouldPulse ? "default" : "ghost"}
                  onClick={handleNextNugget}
                  isPulsating={shouldPulse}
                  className="gap-2"
                >
                  {t("tune.buttons.next")}
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full flex-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t("tune.comments.title")}</div>
              {evaluationLabel ? (
                <Badge variant="outline" className="text-xs">
                  {evaluationLabel}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p
              key={commentKey}
              className="comment-typing text-sm leading-relaxed text-foreground/90 motion-reduce:animate-none"
            >
              {commentText}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("tune.comments.helper")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
