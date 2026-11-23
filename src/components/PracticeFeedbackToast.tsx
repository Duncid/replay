import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PracticeFeedbackToastProps {
  message: string;
  /** A new evaluation object reopens the toast even when its text repeats. */
  event: object | number | string;
  pending?: boolean;
  dismissLabel: string;
  children?: ReactNode;
  /** Null keeps reference examples visible in the design-system catalog. */
  durationMs?: number | null;
}

export function PracticeFeedbackToast({ message, event, pending = false, dismissLabel, children, durationMs }: PracticeFeedbackToastProps) {
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const readingTime = durationMs === undefined
    ? Math.max(6000, Math.min(16000, 2000 + message.trim().split(/\s+/).length * 300))
    : durationMs;

  // Reset before paint so a previous exit cannot hide a newly arrived result.
  useLayoutEffect(() => {
    setPhase("visible");
  }, [event, message, pending]);

  useEffect(() => {
    if (phase !== "visible" || pending || hovered || focused || readingTime === null) return;
    const timer = setTimeout(() => setPhase("leaving"), readingTime);
    return () => clearTimeout(timer);
  }, [event, message, phase, pending, hovered, focused, readingTime]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("hidden"), 220);
    return () => clearTimeout(timer);
  }, [phase, event, message, pending]);

  return (
    <div
      className="practice-feedback-toast practice-chrome relative rounded-3xl border border-border px-5 py-4 shadow-lg"
      data-state={phase}
      style={{ display: phase === "hidden" ? "none" : undefined }}
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 rounded-full"
        aria-label={dismissLabel}
        onClick={() => { setFocused(false); setHovered(false); setPhase("leaving"); }}
      ><X /></Button>
      <div className="max-h-[min(40dvh,20rem)] overflow-y-auto pr-7">
        <div style={{ display: pending ? "none" : undefined }}>{children}</div>
        <div role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-3">
          {pending && <Loader2 aria-hidden="true" className="mt-1 size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />}
          <p className="text-base leading-relaxed text-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}
