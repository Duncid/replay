import { PianoSheetPixi } from "@/components/PianoSheetPixi";
import type { NoteEvent } from "@/components/PianoSheetPixiLayout";
import { TuneEvaluationNotesTable } from "@/components/TuneEvaluationNotesTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSheetPlaybackEngine } from "@/hooks/useSheetPlaybackEngine";
import { cn } from "@/lib/utils";
import type { NoteSequence } from "@/types/noteSequence";
import type {
  PracticePlanItem,
  TuneEvaluationDebugData,
  TuneEvaluationResponse,
} from "@/types/tunePractice";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import { ArrowLeft, ArrowRight, List, Minus, Play, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  currentEvalIndex?: number;
  pendingEvalIndex?: number;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (
    handler: ((noteKey: string) => void) | null,
  ) => void;
  evalPrompt?: string | null;
  evalAnswer?: string | null;
  evalDecision?: string | null;
  evalDebugData?: TuneEvaluationDebugData | null;
}

const STREAK_THRESHOLD = 3;

// Status display for top left (Playing, Sending, or Close evaluation)
function StatusDisplay({
  isRecording,
  isEvaluating,
  lastEvaluation,
  labels,
  debugMode,
  currentEvalIndex,
  pendingEvalIndex,
}: {
  isRecording: boolean;
  isEvaluating: boolean;
  lastEvaluation?: TuneEvaluationResponse | null;
  labels: { playing: string; sending: string; close: string };
  debugMode?: boolean;
  currentEvalIndex?: number;
  pendingEvalIndex?: number;
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
        {debugMode && pendingEvalIndex !== undefined && (
          <span className="text-xs font-mono text-muted-foreground/70">
            #{pendingEvalIndex}
          </span>
        )}
      </div>
    );
  }

  // Only show "close" evaluation (pass/fail are shown in streak display)
  if (lastEvaluation?.evaluation === "close") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
        <Minus className="h-4 w-4" />
        <span className="text-sm font-medium">{labels.close}</span>
        {debugMode && currentEvalIndex !== undefined && (
          <span className="text-xs font-mono opacity-70">
            #{currentEvalIndex}
          </span>
        )}
      </div>
    );
  }

  // Show eval index in debug mode when there's a recent evaluation
  if (debugMode && currentEvalIndex !== undefined && lastEvaluation) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground min-h-[24px]">
        <span className="text-xs font-mono">Eval #{currentEvalIndex}</span>
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
  className,
}: {
  lastEvaluation?: TuneEvaluationResponse | null;
  currentNuggetId: string;
  messages: { success: string; fail: string; close: string };
  className?: string;
}) {
  const [fires, setFires] = useState<number[]>([]); // Array of unique IDs for fires to enable staggered removal
  const [tempMessage, setTempMessage] = useState<
    "success" | "fail" | "close" | null
  >(null);
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
        const timer = setTimeout(
          () => {
            const fireId = nextFireIdRef.current++;
            setFires((prev) => [...prev, fireId]);
            if (i === successCount - 1) {
              setTempMessage(null);
              setMessageVisible(false);
            }
          },
          initialDelay + i * fireDelay,
        );
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
    <div className={cn("flex items-center gap-2", className)}>
      {/* Fires */}
      {fires.map((fireId, index) => (
        <span
          key={fireId}
          className={cn(
            "text-lg transition-opacity duration-300",
            isRemovingFires ? "opacity-0" : "opacity-100",
          )}
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
  currentEvalIndex,
  pendingEvalIndex,
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
  evalPrompt,
  evalAnswer,
  evalDecision,
  evalDebugData,
}: TunePracticeProps) {
  const { t } = useTranslation();
  const streakComplete = currentStreak >= STREAK_THRESHOLD;
  const [shouldPulse, setShouldPulse] = useState(false);
  const [pulsedStreak, setPulsedStreak] = useState<number | null>(null);
  const [showPlanSheet, setShowPlanSheet] = useState(false);
  const [commentKey, setCommentKey] = useState(0);
  const [showEvalDebug, setShowEvalDebug] = useState(false);
  const isFirstNugget = currentIndex === 0;
  const handleCopyEvalDebug = async () => {
    const promptText = evalPrompt?.trim() ?? "";
    const answerText = evalAnswer?.trim() ?? "";
    const payload = `Prompt sent:\n${promptText}\n\nAnswer received:\n${answerText}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        return;
      }
    } catch {
      // fall through to legacy copy approach
    }

    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };
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
  const sampleSequence = (currentNugget.nugget?.noteSequence ||
    currentNugget.assembly?.noteSequence ||
    currentNugget.fullTune?.noteSequence) as NoteSequence | undefined;

  const commentText =
    lastEvaluation?.feedbackText ?? t("tune.comments.noComments");
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
    if (
      pulsedStreak !== STREAK_THRESHOLD &&
      currentStreak >= STREAK_THRESHOLD
    ) {
      setShouldPulse(true);
      setPulsedStreak(STREAK_THRESHOLD);
      const timer = setTimeout(() => setShouldPulse(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [streakComplete, currentStreak, pulsedStreak]);

  // ── PianoSheetPixi: convert NoteSequence → NoteEvent[] ────────────
  const notes = useMemo<NoteEvent[]>(() => {
    if (!sampleSequence) return [];
    return sampleSequence.notes.map((note, index) => ({
      id: `${note.pitch}-${note.startTime}-${index}`,
      midi: note.pitch,
      start: note.startTime,
      dur: Math.max(0, note.endTime - note.startTime),
      accidental: midiToNoteName(note.pitch).includes("#")
        ? ("sharp" as const)
        : null,
    }));
  }, [sampleSequence]);

  // ── PianoSheetPixi: ResizeObserver sizing ─────────────────────────
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const [pixiSize, setPixiSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = pixiContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setPixiSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── PianoSheetPixi: playback engine ───────────────────────────────
  const onTickRef = useRef<((timeSec: number) => void) | null>(null);

  const onTick = useCallback((t: number) => {
    onTickRef.current?.(t);
  }, []);

  const playback = useSheetPlaybackEngine({
    notes,
    enabled: notes.length > 0,
    onTick,
  });

  const bpm = useMemo(() => {
    const seq = sampleSequence ?? { notes: [], totalTime: 0 };
    const tempo = (seq as NoteSequence).tempos?.[0]?.qpm;
    return Math.round(tempo ?? 120);
  }, [sampleSequence]);

  // Sync visual playback with external audio playback
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      // Audio just started → start visual playback
      playback.play();
    } else if (!isPlaying && wasPlayingRef.current) {
      // Audio just stopped → reset visual playback
      playback.stop();
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, playback]);

  // Wire up note handlers for user input → playback engine
  useEffect(() => {
    if (!onRegisterNoteHandler) return;
    const handler = (noteKey: string) => {
      const midi = noteNameToMidi(noteKey);
      playback.handleInputEvent({
        type: "noteon",
        midi,
        timeMs: performance.now(),
      });
    };
    onRegisterNoteHandler(handler);
    return () => onRegisterNoteHandler(null);
  }, [onRegisterNoteHandler, playback]);

  useEffect(() => {
    if (!onRegisterNoteOffHandler) return;
    const handler = (noteKey: string) => {
      const midi = noteNameToMidi(noteKey);
      playback.handleInputEvent({
        type: "noteoff",
        midi,
        timeMs: performance.now(),
      });
    };
    onRegisterNoteOffHandler(handler);
    return () => onRegisterNoteOffHandler(null);
  }, [onRegisterNoteOffHandler, playback]);

  const handleNextNugget = () => {
    setShouldPulse(false);
    setPulsedStreak(null);
    onSwitchNugget();
  };

  return (
    <div className="relative flex h-full w-full flex-col gap-4 py-2">
      <div className="absolute top-0 left-0 flex items-center justify-between p-2 gap-2">
        <StatusDisplay
          isRecording={isRecording}
          isEvaluating={isEvaluating}
          lastEvaluation={lastEvaluation}
          labels={statusLabels}
          debugMode={debugMode}
          currentEvalIndex={currentEvalIndex}
          pendingEvalIndex={pendingEvalIndex}
        />
        <div className="flex items-center gap-2">
          {debugMode && practicePlan.length > 0 && (
            <Sheet open={showPlanSheet} onOpenChange={setShowPlanSheet}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" title="View Practice Plan">
                  <List />
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
                        item.itemType === "nugget"
                          ? "Nugget"
                          : item.itemType === "assembly"
                            ? "Assembly"
                            : "Full Tune";

                      return (
                        <div
                          key={`${item.itemId}-${index}`}
                          className={cn(
                            "p-4 rounded-lg border",
                            isCurrent
                              ? "border-primary bg-primary/5"
                              : "border-border bg-muted/30",
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
                              <span className="text-xs text-muted-foreground">
                                Motifs:
                              </span>
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
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="flex flex-col items-center justify-end gap-4 pt-12">
          <p
            key={commentKey}
            className="text-foreground text-center text-base px-3 comment-typing motion-reduce:animate-none"
          >
            {lastEvaluation ? commentText : currentNugget.instruction}
          </p>
          <Button
            variant="default"
            size="play"
            onClick={onPlaySample}
            disabled={isPlaying}
          >
            <Play fill="currentColor" stroke="none" />
          </Button>
        </div>

        <div className="flex w-full flex-1 flex-col items-center justify-center gap-2">
          <div
            ref={pixiContainerRef}
            className="w-full flex-1 min-h-0 overflow-hidden"
          >
            {pixiSize.width > 0 && pixiSize.height > 0 && notes.length > 0 && (
              <PianoSheetPixi
                notes={notes}
                width={pixiSize.width}
                height={pixiSize.height}
                timeSignatures={sampleSequence?.timeSignatures}
                qpm={bpm}
                onTickRef={onTickRef}
                focusedNoteIds={playback.focusedNoteIds}
                activeNoteIds={playback.activeNoteIds}
                followPlayhead
                isAutoplay={playback.isAutoplay}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onLeave} size="sm">
            <X /> Leave
          </Button>
          <Button
            variant="ghost"
            onClick={onPreviousNugget}
            size="sm"
            disabled={isFirstNugget}
          >
            <ArrowLeft />
            {t("tune.buttons.previous")}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <StreakDisplay
            lastEvaluation={lastEvaluation}
            currentNuggetId={currentNugget.itemId}
            messages={streakMessages}
          />
          {debugMode && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <span>
                  Eval index: {lastEvaluation?.evalIndex ?? "-"} /{" "}
                  {currentEvalIndex ?? "-"}
                </span>
                {evalDecision ? (
                  <span className="text-[10px] text-muted-foreground/80">
                    {evalDecision}
                  </span>
                ) : null}
              </div>
              <Sheet open={showEvalDebug} onOpenChange={setShowEvalDebug}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline">
                    Debug
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[520px] sm:max-w-[520px]"
                >
                  <SheetHeader>
                    <div className="flex items-center justify-between gap-3">
                      <SheetTitle>Eval debug</SheetTitle>
                    </div>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-140px)] mt-4">
                    <div className="space-y-3">
                      {evalDebugData ? (
                        <TuneEvaluationNotesTable debugData={evalDebugData} />
                      ) : null}
                      <div className="flex justify-end items-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCopyEvalDebug}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-4 text-sm">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">
                          Prompt
                        </div>
                        <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs text-foreground/90">
                          {evalPrompt || "No prompt available."}
                        </pre>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">
                          Answer
                        </div>
                        <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs text-foreground/90">
                          {evalAnswer || "No answer available."}
                        </pre>
                      </div>
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
        <Button
          variant={shouldPulse ? "default" : "ghost"}
          onClick={handleNextNugget}
          isPulsating={shouldPulse}
          size="sm"
        >
          {t("tune.buttons.next")}
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
