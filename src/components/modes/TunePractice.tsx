import {
  getRecommendedPianoSheetSize,
  PianoSheetPixi,
  type PianoSheetSize,
} from "@/components/PianoSheetPixi";
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
import { ArrowLeft, ArrowRight, Play, RotateCcw, X } from "lucide-react";
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
  totalWins: number;
  lastEvaluation?: TuneEvaluationResponse | null;
  onPlaySample: () => void;
  onPlayheadReachedEnd?: () => void;
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
  showPlanSheet?: boolean;
  onShowPlanSheetChange?: (open: boolean) => void;
  showEvalDebug?: boolean;
  onShowEvalDebugChange?: (open: boolean) => void;
}

const STREAK_THRESHOLD = 3;

// Status display for top left: only "Sending" when sending, nothing when listening
function StatusDisplay({
  isEvaluating,
  labels,
}: {
  isEvaluating: boolean;
  labels: { sending: string };
}) {
  if (isEvaluating) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
        <span className="text-sm font-medium">{labels.sending}</span>
      </div>
    );
  }
  return <div className="min-h-[24px]" />;
}

// Wins display: totalWins flames; on pass add new ones with animation, on fail/close only show message (no removal)
function StreakDisplay({
  totalWins,
  lastEvaluation,
  currentNuggetId,
  messages,
  className,
}: {
  totalWins: number;
  lastEvaluation?: TuneEvaluationResponse | null;
  currentNuggetId: string;
  messages: { success: string; fail: string; close: string };
  className?: string;
}) {
  const [fires, setFires] = useState<number[]>([]);
  const [tempMessage, setTempMessage] = useState<
    "success" | "fail" | "close" | null
  >(null);
  const [messageVisible, setMessageVisible] = useState(false);
  const nextFireIdRef = useRef(0);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const prevTotalWinsRef = useRef(0);

  // Reset on nugget change
  useEffect(() => {
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];
    setFires([]);
    setTempMessage(null);
    setMessageVisible(false);
    prevTotalWinsRef.current = 0;
  }, [currentNuggetId]);

  // Handle evaluation: on pass add new flames with animation; on fail/close show message only
  useEffect(() => {
    if (!lastEvaluation) {
      return;
    }
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];

    const evaluation = lastEvaluation.evaluation;

    if (evaluation === "pass") {
      const successCount = Math.max(1, lastEvaluation.successCount ?? 1);
      setTempMessage("success");
      const fadeInTimer = setTimeout(() => setMessageVisible(true), 10);
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
      prevTotalWinsRef.current = totalWins;
    } else if (evaluation === "fail") {
      setTempMessage("fail");
      const fadeInTimer = setTimeout(() => setMessageVisible(true), 10);
      timeoutRefs.current.push(fadeInTimer);
      const timer = setTimeout(() => {
        setTempMessage(null);
        setMessageVisible(false);
      }, 2000);
      timeoutRefs.current.push(timer);
    } else if (evaluation === "close") {
      setTempMessage("close");
      const fadeInTimer = setTimeout(() => setMessageVisible(true), 10);
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
  }, [lastEvaluation, totalWins]);

  // Sync fires length to totalWins when we're behind (e.g. initial load or state sync)
  useEffect(() => {
    if (fires.length < totalWins && !lastEvaluation) {
      const toAdd = totalWins - fires.length;
      setFires((prev) => {
        const next = [...prev];
        for (let i = 0; i < toAdd; i++) {
          next.push(nextFireIdRef.current++);
        }
        return next;
      });
    }
  }, [totalWins, fires.length, lastEvaluation]);

  return (
    <div className={cn("flex items-center gap-2 h-8", className)}>
      {fires.map((fireId) => (
        <span key={fireId} className="text-lg">
          🔥
        </span>
      ))}
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
  totalWins,
  lastEvaluation,
  onPlaySample,
  onSwitchNugget,
  onPreviousNugget,
  onLeave,
  isPlaying = false,
  isEvaluating = false,
  onPlayheadReachedEnd,
  practicePlan = [],
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
  evalPrompt,
  evalAnswer,
  evalDebugData,
  showPlanSheet = false,
  onShowPlanSheetChange,
  showEvalDebug = false,
  onShowEvalDebugChange,
}: TunePracticeProps) {
  const { t } = useTranslation();
  const streakComplete = totalWins >= STREAK_THRESHOLD;
  const [shouldPulse, setShouldPulse] = useState(false);
  const [pulsedStreak, setPulsedStreak] = useState<number | null>(null);
  const [commentKey, setCommentKey] = useState(0);
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
    sending: t("tune.status.sending"),
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

  const updatePixiSizeFromRef = useCallback(() => {
    const el = pixiContainerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPixiSize({ width, height });
  }, []);

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
    // Initial measurement in case the first callback had zero size
    const raf = requestAnimationFrame(() => {
      const { width, height } = el.getBoundingClientRect();
      setPixiSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  // Re-measure when notes appear so we get correct size after layout settles
  useEffect(() => {
    if (notes.length === 0) return;
    const raf = requestAnimationFrame(() => updatePixiSizeFromRef());
    return () => cancelAnimationFrame(raf);
  }, [notes.length, updatePixiSizeFromRef]);

  // Fallback: window resize — read container size after reflow so canvas gets correct dimensions.
  // ResizeObserver may not fire when only the window changes; read after rAF so layout is applied.
  const resizeDebounceMs = 80;
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    const onResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        // Read after the next frame so flex layout has been recalculated
        rafId = requestAnimationFrame(() => {
          rafId = null;
          updatePixiSizeFromRef();
        });
      }, resizeDebounceMs);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (timeoutId) clearTimeout(timeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [updatePixiSizeFromRef]);

  // Adaptive size: pick largest preset that fits available height
  const trackCount = useMemo(() => {
    if (notes.length === 0) return 0;
    const minMidi = Math.min(...notes.map((n) => n.midi));
    const maxMidi = Math.max(...notes.map((n) => n.midi));
    return maxMidi - minMidi + 1;
  }, [notes]);
  const pianoSheetSize = useMemo((): PianoSheetSize => {
    if (pixiSize.height <= 0) return "md";
    return getRecommendedPianoSheetSize(pixiSize.height, trackCount);
  }, [pixiSize.height, trackCount]);

  // ── PianoSheetPixi: playback engine ───────────────────────────────
  const onTickRef = useRef<((timeSec: number) => void) | null>(null);

  const onTick = useCallback((t: number) => {
    onTickRef.current?.(t);
  }, []);

  const playback = useSheetPlaybackEngine({
    notes,
    enabled: notes.length > 0,
    onTick,
    onReachedEnd: onPlayheadReachedEnd,
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
        <StatusDisplay isEvaluating={isEvaluating} labels={statusLabels} />
      </div>

      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="flex flex-col items-center justify-end px-3">
          <StreakDisplay
            totalWins={totalWins}
            lastEvaluation={lastEvaluation}
            currentNuggetId={currentNugget.itemId}
            messages={streakMessages}
          />
          <p
            key={commentKey}
            className="text-foreground text-center text-base px-3 comment-typing motion-reduce:animate-none"
          >
            {lastEvaluation ? commentText : currentNugget.instruction}
          </p>
        </div>

        <div className="flex w-full flex-1 flex-col items-center justify-center gap-2">
          {/* Outer div is sized by flex only; inner div + canvas are out-of-flow so they don't prevent shrinking */}
          <div
            ref={pixiContainerRef}
            className="relative w-full flex-1 min-h-0 overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full">
              {pixiSize.width > 0 && pixiSize.height > 0 && notes.length > 0 && (
                <PianoSheetPixi
                  notes={notes}
                  width={pixiSize.width}
                  height={pixiSize.height}
                  size={pianoSheetSize}
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
      </div>

      {/* Practice Plan Sheet (opened from action bar debug dropdown) */}
      <Sheet
        open={showPlanSheet}
        onOpenChange={(open) => onShowPlanSheetChange?.(open)}
      >
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

      {/* Eval Debug Sheet (opened from action bar debug dropdown) */}
      <Sheet
        open={showEvalDebug}
        onOpenChange={(open) => onShowEvalDebugChange?.(open)}
      >
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px]">
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

      <div className="grid grid-cols-3 shrink-0 items-center gap-2 mx-4">
        <div className="flex items-center justify-start gap-1">
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
        <div className="flex items-center justify-center gap-1">
          <div className="bg-key-black p-1 border border-border rounded-2xl ">
            <Button
              variant="default"
              onClick={onPlaySample}
              disabled={isPlaying}
              size="sm"
            >
              <Play fill="currentColor" stroke="none" />{" "}
              {t("tune.buttons.replay")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => playback.stop()}
              size="sm"
              title={t("tune.buttons.restart")}
            >
              <RotateCcw /> {t("tune.buttons.restart")}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" onClick={onLeave} size="sm">
            Leave <X />
          </Button>
          <div className="w-px h-4 bg-border" />
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
    </div>
  );
}
