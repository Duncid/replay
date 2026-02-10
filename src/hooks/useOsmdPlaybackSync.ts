import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface UseOsmdPlaybackSyncOptions {
  /** Ref to the current QPM (quarter-notes per minute). Read inside callbacks to avoid recreating them. */
  qpmRef: React.RefObject<number>;
  /** Ref to the overflow-x-auto wrapper around the OSMD view. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref that tracks whether playback is in autoplay mode. */
  isAutoplayRef: React.RefObject<boolean>;
  /** CSS color string for the OSMD cursor (passed to CursorOptions.color). */
  cursorColor?: string;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useOsmdPlaybackSync({
  qpmRef,
  scrollContainerRef,
  isAutoplayRef,
  cursorColor = "#FFECB3",
}: UseOsmdPlaybackSyncOptions) {
  // ── Refs ────────────────────────────────────────────────────────

  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorInitializedRef = useRef(false);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track last timeSec to skip redundant ticks
  const lastTimeSecRef = useRef(-1);
  // Track the last targetTs we seeked to, to detect actual backward seeks
  const lastTargetTsRef = useRef(-1);

  // Scroll state
  const lastUserScrollMsRef = useRef<number | null>(null);
  const scrollingRef = useRef(false);

  // ── Cursor helpers ──────────────────────────────────────────────

  /**
   * Configure cursor color and z-index using OSMD's own API.
   * OSMD handles the gradient (white → color → color → white) internally.
   */
  const configureCursor = useCallback(() => {
    const cursor = osmdRef.current?.cursor;
    if (!cursor) return;
    cursor.CursorOptions = { ...cursor.CursorOptions, color: cursorColor };
    cursor.wantedZIndex = "1";
  }, [cursorColor]);

  /**
   * Patch cursor element after every OSMD update():
   * 1. Fix height — Tailwind Preflight `img { height: auto }` overrides
   *    OSMD's HTML height attribute. Copy to inline style.
   * 2. Replace image — OSMD hardcodes white edges in its gradient.
   *    We regenerate with transparent → color → transparent.
   */
  const patchCursorElement = useCallback(() => {
    const el = osmdRef.current?.cursor?.cursorElement;
    if (!el) return;

    // Fix height
    const h = el.getAttribute("height");
    if (h) el.style.height = h + "px";

    // Replace gradient: transparent → cursorColor → transparent
    const w = el.width || 30;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.globalAlpha = 0.5;
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.2, cursorColor);
    gradient.addColorStop(0.8, cursorColor);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, 1);
    el.src = c.toDataURL("image/png");
  }, [cursorColor]);

  /** Reset OSMD cursor to the very start and show it. */
  const resetCursorToStart = useCallback(() => {
    const cursor = osmdRef.current?.cursor;
    if (cursor) {
      configureCursor();
      cursor.reset(); // internally calls update() → handles position/size
      cursor.show(); // internally calls update() + adjustToBackgroundColor()
      patchCursorElement();
    }
    cursorInitializedRef.current = true;
    lastTimeSecRef.current = -1;
    lastTargetTsRef.current = -1;
    scrollingRef.current = false;

    // Scroll container back to start
    const container = scrollContainerRef.current;
    if (container) container.scrollTo({ left: 0, behavior: "smooth" });
  }, [configureCursor, patchCursorElement, scrollContainerRef]);

  // ── Scroll logic (pagination-style) ─────────────────────────────
  //
  // Do nothing while cursor is in the left 75% of the viewport.
  // When it crosses 75%, smooth-scroll so it lands at 25%.

  const scrollTowardsCursor = useCallback(() => {
    const container = scrollContainerRef.current;
    const cursorEl = osmdRef.current?.cursor?.cursorElement;
    if (!container || !cursorEl) return;

    // Pause auto-scroll when the user recently scrolled manually
    const nowMs = performance.now();
    const lastUserMs = lastUserScrollMsRef.current;
    if (lastUserMs && nowMs - lastUserMs < 2000) return;

    // Don't re-trigger while a smooth scroll is in flight
    if (scrollingRef.current) return;

    const cursorX = cursorEl.offsetLeft;
    const containerWidth = container.clientWidth;
    const cursorViewportX = cursorX - container.scrollLeft;

    // Cursor still in the comfortable zone — do nothing
    if (cursorViewportX < containerWidth * 0.75) return;

    // Cursor crossed 75% — paginate so it lands at 25%
    const maxScroll = container.scrollWidth - containerWidth;
    const targetScroll = Math.max(
      0,
      Math.min(maxScroll, cursorX - containerWidth * 0.25),
    );

    scrollingRef.current = true;
    container.scrollTo({ left: targetScroll, behavior: "smooth" });

    // Reset scrolling flag when the animation finishes.
    // Use scrollend event with a timeout fallback (scrollend isn't universal).
    const onDone = () => {
      scrollingRef.current = false;
      container.removeEventListener("scrollend", onDone);
      clearTimeout(fallback);
    };
    container.addEventListener("scrollend", onDone, { once: true });
    const fallback = setTimeout(onDone, 600);
  }, [scrollContainerRef]);

  // ── Per-frame tick (timestamp-based) ────────────────────────────

  const onOsmdTick = useCallback(
    (timeSec: number) => {
      const cursor = osmdRef.current?.cursor;
      if (!cursor) return;

      // Ensure cursor is visible on the first tick
      if (!cursorInitializedRef.current) {
        resetCursorToStart();
      }

      // Skip redundant ticks when time hasn't changed (e.g. paused at 0)
      const timeDelta = Math.abs(timeSec - lastTimeSecRef.current);
      if (timeDelta < 1e-6) return;
      lastTimeSecRef.current = timeSec;

      // Convert seconds to OSMD's whole-note timestamp units:
      // qpm = quarter notes per minute, quarter note = 60/qpm sec
      // whole note = 4 quarters = 240/qpm sec
      // => osmdTs = timeSec * qpm / 240
      const currentQpm = qpmRef.current;
      const targetTs = (timeSec * currentQpm) / 240;

      // Read the cursor's current OSMD timestamp
      const currentTs = cursor.iterator?.currentTimeStamp?.RealValue ?? -1;



      // Only reset (seek backwards) if the TARGET has actually decreased,
      // i.e. the user seeked backwards. Don't reset just because the cursor
      // landed one note past targetTs (notes are discrete positions).
      const isBackwardSeek = targetTs < lastTargetTsRef.current - 1e-4;
      lastTargetTsRef.current = targetTs;

      if (isBackwardSeek) {
        // True backward seek — reset and walk forward
        configureCursor();
        cursor.reset(); // calls update() internally
        let safetyCount = 0;
        const maxSteps = 2000;
        while (
          !cursor.iterator?.EndReached &&
          (cursor.iterator?.currentTimeStamp?.RealValue ?? 999) <
            targetTs - 1e-4 &&
          safetyCount < maxSteps
        ) {
          cursor.next(); // calls update() internally
          safetyCount++;
        }
        patchCursorElement();
        scrollTowardsCursor();
        return;
      }

      // If cursor is behind target, advance forward
      if (currentTs < targetTs - 1e-4) {
        let safetyCount = 0;
        const maxSteps = 200;
        while (
          !cursor.iterator?.EndReached &&
          (cursor.iterator?.currentTimeStamp?.RealValue ?? 999) <
            targetTs - 1e-4 &&
          safetyCount < maxSteps
        ) {
          cursor.next(); // calls update() internally
          safetyCount++;
        }
        patchCursorElement();
      }

      // Scroll regardless (even if cursor hasn't moved, smooth scroll continues)
      scrollTowardsCursor();
    },
    [
      resetCursorToStart,
      scrollTowardsCursor,
      configureCursor,
      patchCursorElement,
      qpmRef,
    ],
  );

  // ── OSMD lifecycle callback ─────────────────────────────────────

  const handleOsmdReady = useCallback(
    (osmd: OpenSheetMusicDisplay) => {
      osmdRef.current = osmd;
      cursorInitializedRef.current = false;
      lastTargetTsRef.current = -1;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      initTimeoutRef.current = setTimeout(() => {
        resetCursorToStart();
        initTimeoutRef.current = null;
      }, 300);
    },
    [resetCursorToStart],
  );

  // ── User scroll detection ───────────────────────────────────────

  const handleUserScroll = useCallback(() => {
    lastUserScrollMsRef.current = performance.now();
  }, []);

  // ── Return ──────────────────────────────────────────────────────

  return {
    handleOsmdReady,
    onOsmdTick,
    handleUserScroll,
    resetCursorToStart,
  };
}
