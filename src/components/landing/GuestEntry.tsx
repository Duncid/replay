import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Landing from "@/pages/Landing";
import { GuestEntryContext, type GuestEntryPhase } from "./GuestEntryContext";
import { animateGuestEntry } from "./animateGuestEntry";
import "./GuestEntry.css";

const loadGuest = () => import("@/pages/GuestApp");
const GuestApp = lazy(loadGuest);
const preload = () => { void loadGuest().catch(() => {}); };

/** This route layout survives / → /play so the outgoing iPad never remounts. */
export default function GuestEntry({ canEnter = true }: { canEnter?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<GuestEntryPhase>("idle");
  const widthProbe = useRef<HTMLDivElement>(null);
  const [keyboardWidth, setKeyboardWidth] = useState<number>();
  const previewPitches = useRef<readonly number[]>([]);
  const setPreviewPitches = useCallback((pitches: readonly number[]) => { previewPitches.current = pitches; }, []);
  const [entryPitches, setEntryPitches] = useState<readonly number[]>();
  useLayoutEffect(() => {
    const probe = widthProbe.current;
    if (!probe) return;
    const measure = () => { if (probe.clientWidth > 0) setKeyboardWidth(probe.clientWidth); };
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    measure();
    return () => observer.disconnect();
  }, []);
  const current = useRef<GuestEntryPhase>("idle");
  const source = useRef<HTMLElement | null>(null);
  const destination = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frames = useRef<number[]>([]);
  const origin = useRef(location.key);
  const generation = useRef(0);
  const focusOnArrival = useRef(false);
  const stopPending = useCallback(() => {
    generation.current++;
    clearTimeout(deadline.current);
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [];
    current.current = "idle";
  }, []);
  const clear = useCallback(() => {
    stopPending();
    cleanup.current?.();
    cleanup.current = null;
  }, [stopPending]);
  const finish = useCallback(() => {
    if (current.current === "idle") return;
    stopPending();
    focusOnArrival.current = true;
    // Hold the final animation frame until the route has committed. Clearing it
    // here briefly restores the landing and hides the destination before React paints.
    navigate("/play");
  }, [stopPending, navigate]);
  const begin = useCallback((element: HTMLElement) => {
    if (!canEnter) return false;
    if (current.current !== "idle") return true;
    if (location.pathname !== "/") return false;
    source.current = element;
    setEntryPitches(previewPitches.current);
    origin.current = location.key;
    const ipad = element.querySelector<HTMLElement>(".landing-ipad");
    if (ipad) {
      const original = ipad.getAttribute("style");
      const transform = getComputedStyle(ipad).transform;
      ipad.style.transition = "none";
      ipad.style.transform = transform;
      cleanup.current = () => original === null ? ipad.removeAttribute("style") : ipad.setAttribute("style", original);
    }
    current.current = "preparing";
    setPhase("preparing");
    preload();
    deadline.current = setTimeout(finish, 1500);
    return true;
  }, [canEnter, location.key, location.pathname, finish]);

  const ready = useCallback(() => {
    if (current.current !== "preparing") return;
    const request = generation.current;
    frames.current.push(requestAnimationFrame(() => {
      frames.current.push(requestAnimationFrame(() => {
        if (request !== generation.current || current.current !== "preparing" || !source.current || !destination.current) return;
        clearTimeout(deadline.current);
        current.current = "animating";
        setPhase("animating");
        const simple = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          source.current.dataset.previewMode === "video" || source.current.dataset.previewState !== "ready";
        try {
          const animation = animateGuestEntry(source.current, destination.current, simple);
          const restoreTilt = cleanup.current;
          cleanup.current = () => { animation.cancel(); restoreTilt?.(); };
          void animation.finished.catch(() => {}).then(() => { if (request === generation.current) finish(); });
          // A suspended animation must never leave the interface blocked.
          deadline.current = setTimeout(finish, 1200);
        } catch { finish(); }
      }));
    }));
  }, [finish]);

  useLayoutEffect(() => {
    if (location.key !== origin.current) {
      clear();
      setPhase("idle");
    }
  }, [location.key, clear]);
  useEffect(() => {
    const interrupt = () => finish();
    const visibility = () => { if (document.hidden) finish(); };
    window.addEventListener("resize", interrupt);
    window.addEventListener("orientationchange", interrupt);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("resize", interrupt);
      window.removeEventListener("orientationchange", interrupt);
      document.removeEventListener("visibilitychange", visibility);
      clear();
    };
  }, [clear, finish]);
  useEffect(() => {
    if (location.pathname !== "/play" || phase !== "idle" || !focusOnArrival.current) return;
    const focus = () => {
      const heading = destination.current?.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      focusOnArrival.current = false;
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => { if (focus()) observer.disconnect(); });
    if (destination.current) observer.observe(destination.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname, phase]);
  const entering = phase !== "idle";
  return <GuestEntryContext.Provider value={{ phase, begin, preload: canEnter ? preload : () => {}, keyboardWidth, setPreviewPitches }}>
    <div className="guest-entry" data-entry-phase={phase}>
      {/* Measure the eventual workspace keys, not the scaled/tilted model iPad. */}
      <div ref={widthProbe} className="guest-entry-width-probe" aria-hidden="true" />
      {location.pathname === "/" && <div className="guest-entry-source" inert={entering} aria-hidden={entering || undefined}><Landing /></div>}
      <div ref={destination} className="guest-entry-destination" data-entering={entering || undefined} inert={entering} aria-hidden={entering || undefined}>
        {canEnter && (location.pathname === "/play" || entering) && <Suspense fallback={<div className="h-dvh flex items-center justify-center">Loading music…</div>}>
          <GuestApp interactive={!entering} onReady={ready} initialKeyboardPitches={entryPitches} />
        </Suspense>}
      </div>
    </div>
  </GuestEntryContext.Provider>;
}
