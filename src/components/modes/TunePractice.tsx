import { OpenSheetMusicDisplayView } from "@/components/OpenSheetMusicDisplayView";
import {
  DEFAULT_BASE_UNIT,
  getRecommendedBaseUnit,
  PianoSheetPixi,
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
import { useOsmdPlaybackSync } from "@/hooks/useOsmdPlaybackSync";
import { useSheetPlaybackEngine } from "@/hooks/useSheetPlaybackEngine";
import { useTuneAssets } from "@/hooks/useTuneQueries";
import { cn } from "@/lib/utils";
import type { NoteSequence } from "@/types/noteSequence";
import type {
  PracticePlanItem,
  TuneEvaluationDebugData,
  TuneEvaluationResponse,
} from "@/types/tunePractice";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import {
  getAssemblyXml,
  getNuggetXml,
  getTuneDspXml,
  getTuneXml,
} from "@/utils/tuneAssetBundler";
import {
  ArrowLeft,
  ArrowRight,
  Music,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
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
  tuneKey: string;
  tuneTitle: string;
  currentNugget: PracticePlanItem;
  currentIndex: number;
  totalNuggets: number;
  currentStreak: number;
  totalWins: number;
  lastEvaluation?: TuneEvaluationResponse | null;
  onPlaySample: () => void;
  onStopSample?: () => void;
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

  if (fires.length === 0 && !tempMessage) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
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
  tuneKey,
  currentNugget,
  currentIndex,
  totalNuggets,
  currentStreak,
  totalWins,
  lastEvaluation,
  onPlaySample,
  onStopSample,
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
  const [showSheetView, setShowSheetView] = useState(false);
  const [pulsedStreak, setPulsedStreak] = useState<number | null>(null);
  const [commentKey, setCommentKey] = useState(0);
  const [leavingText, setLeavingText] = useState<string | null>(null);
  const [showSending, setShowSending] = useState(false);
  const [feedbackArrivedPulse, setFeedbackArrivedPulse] = useState(false);
  const leavingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstNugget = currentIndex === 0;
  const isLastNugget = currentIndex >= totalNuggets - 1;
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

  // ── XML for sheet view (published or local) ────────────────────────
  const { data: tuneAssets } = useTuneAssets(tuneKey);
  const xmlForCurrentNugget = useMemo(() => {
    const itemId = currentNugget.itemId;
    const itemType = currentNugget.itemType;
    if (tuneAssets) {
      if (itemType === "full_tune")
        return tuneAssets.tune_dsp_xml ?? tuneAssets.tune_xml ?? null;
      if (itemType === "assembly") {
        const xmls = tuneAssets.assembly_xmls as Record<string, string> | null;
        return xmls?.[itemId] ?? null;
      }
      const xmls = tuneAssets.nugget_xmls as Record<string, string> | null;
      return xmls?.[itemId] ?? null;
    }
    if (itemType === "full_tune")
      return getTuneDspXml(tuneKey) ?? getTuneXml(tuneKey);
    if (itemType === "assembly") return getAssemblyXml(tuneKey, itemId);
    return getNuggetXml(tuneKey, itemId);
  }, [tuneKey, currentNugget.itemId, currentNugget.itemType, tuneAssets]);

  const hasSheetXml = !!xmlForCurrentNugget;

  // Switch back to Pixi when nugget has no sheet XML
  useEffect(() => {
    if (showSheetView && !hasSheetXml) setShowSheetView(false);
  }, [showSheetView, hasSheetXml]);

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

  // Pulse card when feedback arrives
  useEffect(() => {
    if (!lastEvaluation?.feedbackText) return;
    setFeedbackArrivedPulse(true);
    const t = setTimeout(() => setFeedbackArrivedPulse(false), 2000);
    return () => clearTimeout(t);
  }, [lastEvaluation?.feedbackText]);

  // Feedback card: on eval start, animate text out (reverse), then show "Sending"
  useEffect(() => {
    if (leavingTimeoutRef.current) {
      clearTimeout(leavingTimeoutRef.current);
      leavingTimeoutRef.current = null;
    }
    if (isEvaluating) {
      const currentText = lastEvaluation
        ? commentText
        : currentNugget.instruction;
      setLeavingText(currentText);
      setShowSending(false);
      leavingTimeoutRef.current = setTimeout(() => {
        leavingTimeoutRef.current = null;
        setLeavingText(null);
        setShowSending(true);
      }, 300);
    } else {
      setLeavingText(null);
      setShowSending(false);
    }
    return () => {
      if (leavingTimeoutRef.current) {
        clearTimeout(leavingTimeoutRef.current);
      }
    };
  }, [isEvaluating, commentText, currentNugget.instruction, lastEvaluation]);

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
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
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
  const pianoSheetSize = useMemo((): number => {
    if (pixiSize.height <= 0) return DEFAULT_BASE_UNIT;
    return getRecommendedBaseUnit(pixiSize.height, trackCount);
  }, [pixiSize.height, trackCount]);

  // ── PianoSheetPixi: playback engine ───────────────────────────────
  const bpm = useMemo(() => {
    const seq = sampleSequence ?? { notes: [], totalTime: 0 };
    const tempo = (seq as NoteSequence).tempos?.[0]?.qpm;
    return Math.round(tempo ?? 120);
  }, [sampleSequence]);

  const onTickRef = useRef<((timeSec: number) => void) | null>(null);
  const osmdTickRef = useRef<((timeSec: number) => void) | null>(null);

  const onTick = useCallback((t: number) => {
    onTickRef.current?.(t);
    osmdTickRef.current?.(t);
  }, []);

  const playback = useSheetPlaybackEngine({
    notes,
    enabled: notes.length > 0,
    onTick,
    onReachedEnd: onPlayheadReachedEnd,
  });

  // ── OSMD sheet sync (vertical scroll) ─────────────────────────────
  const osmdScrollRef = useRef<HTMLDivElement>(null);
  const isAutoplayRef = useRef(false);
  const qpmRef = useRef(120);
  isAutoplayRef.current = playback.isAutoplay;
  qpmRef.current = bpm;
  const { handleOsmdReady, onOsmdTick, handleUserScroll, resetCursorToStart } =
    useOsmdPlaybackSync({
      qpmRef,
      scrollContainerRef: osmdScrollRef,
      isAutoplayRef,
      cursorColor: "#FFECB3",
      scrollDirection: "vertical",
    });
  osmdTickRef.current = onOsmdTick;

  // Reset OSMD cursor when playback returns to start (Restart or end-of-track)
  const isAtStart =
    playback.playheadTime < 0.01 &&
    (playback.playheadTimeRef.current ?? 0) < 0.01;
  const prevIsAtStartRef = useRef(true);
  useEffect(() => {
    if (isAtStart && !prevIsAtStartRef.current) {
      resetCursorToStart();
    }
    prevIsAtStartRef.current = isAtStart;
  }, [isAtStart, resetCursorToStart]);

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
    <div className="relative flex h-full w-full flex-col gap-2 py-2">
      {/* Feedback card: bottom-right, max 1/3 width */}
      <div
        className={cn(
          "absolute bottom-16 right-[22%] translate-x-[220px] max-w-[50%] p-6 rounded-3xl border border-gray-500/60 bg-gray-700/60 shadow-lg backdrop-blur-sm z-10 transition-all duration-300 ease-out",
          showSending ? "w-[320px]" : "w-[440px]",
        )}
      >
        <div className="flex items-center justify-center flex-col gap-2">
          <StreakDisplay
            totalWins={totalWins}
            lastEvaluation={lastEvaluation}
            currentNuggetId={currentNugget.itemId}
            messages={streakMessages}
          />
          <div className="min-h-[1.5rem] text-center">
            {leavingText ? (
              <p className="text-foreground text-base comment-typing-reverse motion-reduce:animate-none">
                {leavingText}
              </p>
            ) : showSending ? (
              <p className="text-muted-foreground text-base animate-pulse">
                {statusLabels.sending}
              </p>
            ) : (
              <p
                key={commentKey}
                className="text-foreground text-lg comment-typing motion-reduce:animate-none"
              >
                {lastEvaluation ? commentText : currentNugget.instruction}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-2">
          {/* Shared container: Pixi (hidden when sheet) + Sheet (hidden when Pixi) */}
          <div className="relative w-full flex-1 min-h-0 overflow-hidden">
            {/* Pixi view: stays mounted, invisible when sheet view is shown */}
            <div
              ref={pixiContainerRef}
              className={cn(
                "absolute inset-0 w-full h-full overflow-hidden",
                showSheetView && "invisible",
              )}
            >
              {pixiSize.width > 0 &&
                pixiSize.height > 0 &&
                notes.length > 0 && (
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
            {/* Sheet view: multi-line, vertical scroll, max-w-4xl.
                Use invisible (not hidden) when collapsed so OSMD gets valid dimensions on mount. */}
            <div
              ref={osmdScrollRef}
              onScroll={handleUserScroll}
              className={cn(
                "absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden flex justify-center py-8 border-t border-b border-border",
                !showSheetView && "invisible pointer-events-none",
              )}
            >
              <div className="w-full max-w-4xl">
                {xmlForCurrentNugget ? (
                  <OpenSheetMusicDisplayView
                    xml={xmlForCurrentNugget}
                    compactness="compacttight"
                    hasColor
                    className="relative"
                    renderSingleHorizontalStaffline={false}
                    onOsmdReady={handleOsmdReady}
                    disableCustomCursorStyle
                  />
                ) : (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {t("tune.sheetNoXml")}
                  </div>
                )}
              </div>
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

      <div className="grid grid-cols-3 shrink-0 items-center gap-2 mx-auto w-full max-w-5xl">
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
        <div className="flex items-center justify-center">
          <div className="flex gap-1 bg-key-black p-1 border border-border rounded-2xl">
            <Button
              variant="default"
              onClick={isPlaying ? () => onStopSample?.() : onPlaySample}
              size="sm"
              title={
                isPlaying ? t("tune.buttons.stop") : t("tune.buttons.replay")
              }
            >
              {isPlaying ? (
                <>
                  <Square
                    fill="currentColor"
                    stroke="none"
                    className="size-3"
                  />{" "}
                  {t("tune.buttons.stop")}
                </>
              ) : (
                <>
                  <Play fill="currentColor" stroke="none" />{" "}
                  {t("tune.buttons.replay")}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (isPlaying) onStopSample?.();
                playback.stop();
                resetCursorToStart();
              }}
              size="sm"
              title={t("tune.buttons.restart")}
            >
              <RotateCcw /> {t("tune.buttons.restart")}
            </Button>
            <Button
              variant={showSheetView ? "secondary" : "ghost"}
              size="sm"
              title={t("tune.buttons.sheetView")}
              onClick={() => hasSheetXml && setShowSheetView((v) => !v)}
              disabled={!hasSheetXml}
            >
              <Music />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" onClick={onLeave} size="sm">
            {t("tune.buttons.leave")} <X />
          </Button>
          {!isLastNugget && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
