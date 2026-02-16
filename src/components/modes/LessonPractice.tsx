import type { SkillToUnlock } from "@/components/LessonCard";
import {
  DEFAULT_BASE_UNIT,
  getRecommendedBaseUnit,
  PianoSheetPixi,
} from "@/components/PianoSheetPixi";
import type { NoteEvent } from "@/components/PianoSheetPixiLayout";
import { Button } from "@/components/ui/button";
import { useSheetPlaybackEngine } from "@/hooks/useSheetPlaybackEngine";
import { cn } from "@/lib/utils";
import type { NoteSequence } from "@/types/noteSequence";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import { Play, RotateCcw, Square, Unlock, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

export type EvaluationFeedbackResult = "pass" | "close" | "fail";

export interface EvaluationFeedbackData {
  evaluation: EvaluationFeedbackResult;
  feedbackText: string;
  awardedSkills?: SkillToUnlock[];
}

interface LessonPracticeProps {
  instruction: string;
  targetSequence: NoteSequence;
  isPlaying?: boolean;
  isLoading?: boolean;
  isEvaluating?: boolean;
  isRecording?: boolean;
  evaluationFeedback?: EvaluationFeedbackData | null;
  onPlay: () => void;
  onStopPlayback?: () => void;
  onPlayheadReachedEnd?: () => void;
  onLeave: () => void;
  onDismissFeedback?: () => void;
  onMakeEasier?: () => void;
  onMakeHarder?: () => void;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (
    handler: ((noteKey: string) => void) | null,
  ) => void;
  trackTitle?: string;
  skillToUnlock?: SkillToUnlock | null;
  debugMode?: boolean;
  difficulty?: number;
}

const PASS_EMOJIS = [
  "🌟",
  "🎉",
  "⭐",
  "🔥",
  "💪",
  "✨",
  "🏆",
  "👍",
  "👏",
  "🎸",
];
const CLOSE_EMOJIS = ["💫", "🙏", "😊", "📈", "🎯", "💡", "🌱", "👀"];
const FAIL_EMOJIS = ["🎵", "🔄", "💪", "🔥", "🙂", "📌", "✊", "🎹"];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getEvaluationConfig(evaluation: EvaluationFeedbackResult) {
  switch (evaluation) {
    case "pass":
      return {
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/20",
        titleKey: "evaluation.passTitle" as const,
        titleDefault: "Great job!",
      };
    case "close":
      return {
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/20",
        titleKey: "evaluation.closeTitle" as const,
        titleDefault: "Almost there!",
      };
    case "fail":
      return {
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/20",
        titleKey: "evaluation.failTitle" as const,
        titleDefault: "Keep practicing!",
      };
  }
}

export function LessonPractice({
  instruction,
  targetSequence,
  isPlaying = false,
  isLoading,
  isEvaluating = false,
  isRecording = false,
  evaluationFeedback = null,
  onPlay,
  onStopPlayback,
  onPlayheadReachedEnd,
  onLeave,
  onDismissFeedback,
  onMakeEasier,
  onMakeHarder,
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
  trackTitle: _trackTitle,
  skillToUnlock: _skillToUnlock,
  debugMode = false,
  difficulty: _difficulty,
}: LessonPracticeProps) {
  const { t } = useTranslation();

  // Overlay card state: instruction vs evaluation status (leavingText / showSending)
  const [leavingText, setLeavingText] = useState<string | null>(null);
  const [showSending, setShowSending] = useState(false);
  const leavingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback card: on eval start, animate text out then show "Sending"
  useEffect(() => {
    if (leavingTimeoutRef.current) {
      clearTimeout(leavingTimeoutRef.current);
      leavingTimeoutRef.current = null;
    }
    if (isEvaluating) {
      setLeavingText(instruction);
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
  }, [isEvaluating, instruction]);

  // ── Normalize targetSequence to start at 0 (match Index playSequence) then convert to NoteEvent[] ──────────────────────────
  const notes = useMemo<NoteEvent[]>(() => {
    if (!targetSequence?.notes?.length) return [];
    const minStartTime = Math.min(
      ...targetSequence.notes.map((n) => n.startTime),
    );
    return targetSequence.notes.map((note, index) => ({
      id: `${note.pitch}-${note.startTime}-${index}`,
      midi: note.pitch,
      start: note.startTime - minStartTime,
      dur: Math.max(0, note.endTime - note.startTime),
      accidental: midiToNoteName(note.pitch).includes("#")
        ? ("sharp" as const)
        : null,
    }));
  }, [targetSequence]);

  // ── ResizeObserver + pixiSize ──────────────────────────────────────
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

  useEffect(() => {
    if (notes.length === 0) return;
    const raf = requestAnimationFrame(() => updatePixiSizeFromRef());
    return () => cancelAnimationFrame(raf);
  }, [notes.length, updatePixiSizeFromRef]);

  const resizeDebounceMs = 80;
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    const onResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
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

  const bpm = useMemo(() => {
    const tempo = targetSequence?.tempos?.[0]?.qpm;
    return Math.round(tempo ?? 120);
  }, [targetSequence]);

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

  // Reset playback when sequence changes
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  useEffect(() => {
    playbackRef.current.stop();
  }, [targetSequence]);

  // Sync visual playback with external audio (practice: demo playing)
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      playback.play();
    } else if (!isPlaying && wasPlayingRef.current) {
      playback.stop();
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, playback]);

  // Wire note handlers so playhead advances on user input. Use ref so we don't re-register on every playback identity change.
  const playbackRefForHandlers = useRef(playback);
  playbackRefForHandlers.current = playback;
  useEffect(() => {
    if (!onRegisterNoteHandler) return;
    const handler = (noteKey: string) => {
      const midi = noteNameToMidi(noteKey);
      playbackRefForHandlers.current.handleInputEvent({
        type: "noteon",
        midi,
        timeMs: performance.now(),
      });
    };
    onRegisterNoteHandler(handler);
    return () => onRegisterNoteHandler(null);
  }, [onRegisterNoteHandler]);

  useEffect(() => {
    if (!onRegisterNoteOffHandler) return;
    const handler = (noteKey: string) => {
      const midi = noteNameToMidi(noteKey);
      playbackRefForHandlers.current.handleInputEvent({
        type: "noteoff",
        midi,
        timeMs: performance.now(),
      });
    };
    onRegisterNoteOffHandler(handler);
    return () => onRegisterNoteOffHandler(null);
  }, [onRegisterNoteOffHandler]);

  const hasNotes = notes.length > 0;
  const showFeedbackCard = evaluationFeedback && !isEvaluating;

  // One random emoji per feedback (stable until result or text changes)
  /* eslint-disable react-hooks/exhaustive-deps -- content-only deps so emoji stays stable across re-renders */
  const feedbackEmoji = useMemo(() => {
    if (!evaluationFeedback) return null;
    const arr =
      evaluationFeedback.evaluation === "pass"
        ? PASS_EMOJIS
        : evaluationFeedback.evaluation === "close"
          ? CLOSE_EMOJIS
          : FAIL_EMOJIS;
    return pickRandom(arr);
  }, [evaluationFeedback?.evaluation, evaluationFeedback?.feedbackText]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Overlay card content (feedback, instruction, evaluating, sending, playing, waiting)
  const overlayContent = (() => {
    if (showFeedbackCard) {
      const config = getEvaluationConfig(evaluationFeedback.evaluation);
      const title = t(config.titleKey, config.titleDefault);
      const { awardedSkills } = evaluationFeedback;
      return (
        <div className="space-y-3 text-center">
          <div
            className={cn(
              "mx-auto w-12 h-12 rounded-full flex items-center justify-center border text-3xl",
              config.bgColor,
              config.borderColor,
            )}
          >
            {feedbackEmoji}
          </div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {evaluationFeedback.feedbackText}
          </p>
          {awardedSkills && awardedSkills.length > 0 && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2">
              <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400 mb-1">
                <Unlock className="h-3 w-3" />
                <span className="font-medium text-xs">
                  {t("evaluation.skillsUnlocked", "Skills Unlocked!")}
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                {awardedSkills.map((skill) => (
                  <span
                    key={skill.skillKey}
                    className="bg-green-500/20 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded text-xs"
                  >
                    {skill.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    if (leavingText) {
      return (
        <p className="text-foreground text-base comment-typing-reverse motion-reduce:animate-none">
          {leavingText}
        </p>
      );
    }
    if (showSending) {
      return (
        <p className="text-muted-foreground text-base animate-pulse">
          {t("tune.status.sending")}
        </p>
      );
    }
    if (isEvaluating) {
      return (
        <p className="text-foreground text-base">
          {t("learnMode.evaluating", "Evaluating...")}
        </p>
      );
    }
    if (isRecording) {
      return (
        <p className="text-foreground text-base">
          {t("learnMode.playing", "Playing...")}
        </p>
      );
    }
    return (
      <p className="text-foreground text-lg comment-typing motion-reduce:animate-none">
        {instruction}
      </p>
    );
  })();

  return (
    <div className="relative flex h-full w-full flex-col gap-2 py-2">
      {/* Overlay card: bottom-right (same as TunePractice) */}
      <div
        className={cn(
          "absolute bottom-16 right-[22%] translate-x-[220px] max-w-[50%] p-6 rounded-3xl border border-gray-500/60 bg-gray-700/60 shadow-lg backdrop-blur-sm z-10 transition-all duration-300 ease-out",
          showSending
            ? "w-[320px]"
            : showFeedbackCard
              ? "w-[420px]"
              : "w-[440px]",
        )}
      >
        <div className="flex items-center justify-center flex-col gap-2">
          <div className="min-h-[1.5rem] text-center">{overlayContent}</div>
        </div>
      </div>

      {/* Main area: Pixi container */}
      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-2">
          <div className="relative w-full flex-1 min-h-0 overflow-hidden">
            <div
              ref={pixiContainerRef}
              className="absolute inset-0 w-full h-full overflow-hidden"
            >
              {pixiSize.width > 0 &&
                pixiSize.height > 0 &&
                notes.length > 0 && (
                  <PianoSheetPixi
                    notes={notes}
                    width={pixiSize.width}
                    height={pixiSize.height}
                    size={pianoSheetSize}
                    timeSignatures={targetSequence?.timeSignatures}
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

      {/* Bottom bar: left empty, center play/restart, right: difficulty when feedback then Leave */}
      <div className="grid grid-cols-3 shrink-0 items-center gap-2 mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-start gap-1">
          <Button variant="ghost" onClick={onLeave} size="sm">
            {t("learnMode.leaveButton")} <X />
          </Button>
        </div>
        <div className="flex items-center justify-center">
          <div className="flex gap-1 bg-key-black p-1 border border-border rounded-2xl">
            <Button
              variant="default"
              onClick={isPlaying ? () => onStopPlayback?.() : onPlay}
              size="sm"
              disabled={isLoading || isEvaluating || !hasNotes}
              title={isPlaying ? t("tune.buttons.stop") : t("controls.play")}
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
                if (isPlaying) onStopPlayback?.();
                playback.stop();
              }}
              size="sm"
              disabled={!hasNotes}
              title={t("tune.buttons.restart")}
            >
              <RotateCcw /> {t("tune.buttons.restart")}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1">
          {showFeedbackCard && evaluationFeedback && (
            <>
              {evaluationFeedback.evaluation === "pass" && onMakeHarder && (
                <Button variant="outline" size="sm" onClick={onMakeHarder}>
                  {t("evaluation.tryHarder")}
                </Button>
              )}
              {evaluationFeedback.evaluation !== "pass" && onMakeEasier && (
                <Button variant="outline" size="sm" onClick={onMakeEasier}>
                  {t("evaluation.lowerDifficulty")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
