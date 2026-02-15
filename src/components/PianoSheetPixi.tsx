import {
  getNoteColorForNoteName,
  getNoteColorsForNoteName,
} from "@/constants/noteColors";
import type { TimeSignature } from "@/types/noteSequence";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import { createStripeCanvas } from "@/utils/stripePattern";
import { WRAP_MODES } from "@pixi/constants";
import { Texture } from "@pixi/core";
import { GlowFilter } from "@pixi/filter-glow";
import { Container, Graphics, Stage } from "@pixi/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  computeLayout,
  type NoteEvent,
  type SheetConfig,
} from "./PianoSheetPixiLayout.ts";

const DEFAULT_NOTE_COLORS = {
  idle: 0x9aa0a6,
  active: 0x9aa0a6,
  focused: 0x9aa0a6,
};

function hexToInt(hex: string) {
  return parseInt(hex.replace("#", ""), 16);
}

function getNoteColorsFromMidi(midi: number) {
  const noteName = midiToNoteName(midi);
  const colors = getNoteColorsForNoteName(noteName);
  if (!colors) return DEFAULT_NOTE_COLORS;
  return {
    idle: hexToInt(colors.idle),
    active: hexToInt(colors.active),
    focused: hexToInt(colors.focused),
  };
}

function normalizeSharpNote(noteName: string) {
  const base = noteName.replace(/[0-9]/g, "");
  switch (base) {
    case "C#":
    case "D#":
    case "F#":
    case "G#":
    case "A#":
      return base;
    case "Db":
      return "C#";
    case "Eb":
      return "D#";
    case "Gb":
      return "F#";
    case "Ab":
      return "G#";
    case "Bb":
      return "A#";
    default:
      return null;
  }
}

function createStripeTexture(baseHex: string, stripeHex: string) {
  const canvas = createStripeCanvas(baseHex, stripeHex);
  const texture = Texture.from(canvas);
  texture.baseTexture.wrapMode = WRAP_MODES.REPEAT;
  return texture;
}

export type PianoSheetAlign = "start" | "center" | "end";

export const MIN_BASE_UNIT = 8;
export const MAX_BASE_UNIT = 24;
export const DEFAULT_BASE_UNIT = 12;

/**
 * Returns the largest base unit (px) in [MIN_BASE_UNIT, MAX_BASE_UNIT] that fits
 * in the given available height. minHeight = baseUnit * (2 + trackCount).
 */
export function getRecommendedBaseUnit(
  availableHeight: number,
  trackCount: number
): number {
  const denominator = 2 + trackCount;
  if (denominator <= 0) return MAX_BASE_UNIT;
  const ideal = availableHeight / denominator;
  const clamped = Math.min(
    MAX_BASE_UNIT,
    Math.max(MIN_BASE_UNIT, ideal)
  );
  return Math.floor(clamped);
}

interface PianoSheetPixiProps {
  notes: NoteEvent[];
  width: number;
  height: number;
  /** Base unit in px (8–24). Drives note height and layout scale. */
  size?: number;
  align?: PianoSheetAlign;
  timeSignatures?: TimeSignature[];
  qpm?: number;
  onTickRef: React.MutableRefObject<((timeSec: number) => void) | null>;
  focusedNoteIds?: Set<string>;
  activeNoteIds?: Set<string>;
  followPlayhead?: boolean;
  isAutoplay?: boolean;
}

export function PianoSheetPixi({
  notes,
  width,
  height,
  size: sizeProp = DEFAULT_BASE_UNIT,
  align = "center",
  timeSignatures,
  qpm,
  onTickRef,
  focusedNoteIds = new Set(),
  activeNoteIds = new Set(),
  followPlayhead = false,
  isAutoplay = false,
}: PianoSheetPixiProps) {
  const config = useMemo<SheetConfig>(() => {
    const baseUnit = Math.min(
      MAX_BASE_UNIT,
      Math.max(MIN_BASE_UNIT, sizeProp)
    );
    const noteHeight = baseUnit;
    const trackGap = 0;
    const trackStep = noteHeight + trackGap;

    // Compute MIDI range to determine total track height for alignment
    const minMidi = notes.length
      ? Math.min(...notes.map((n) => n.midi))
      : 0;
    const maxMidi = notes.length
      ? Math.max(...notes.map((n) => n.midi))
      : 0;
    const trackCount = notes.length ? maxMidi - minMidi + 1 : 0;
    const totalTrackHeight = trackCount * trackStep;

    const minTopY = baseUnit * 2;
    let trackTopY: number;
    if (align === "center") {
      trackTopY = Math.max(minTopY, (height - totalTrackHeight) / 2);
    } else if (align === "end") {
      trackTopY = Math.max(minTopY, height - totalTrackHeight - minTopY);
    } else {
      // "start"
      trackTopY = minTopY;
    }

    return {
      pixelsPerUnit: baseUnit * 4,
      noteHeight,
      noteCornerRadius: baseUnit / 2,
      trackGap,
      trackTopY,
      leftPadding: baseUnit * 1.5,
      rightPadding: baseUnit * 1.5,
      viewWidth: width,
      viewHeight: height,
      minNoteWidth: Math.max(6, baseUnit * 0.375),
    };
  }, [sizeProp, align, width, height, notes]);

  const {
    contentWidth,
    noteRects,
    trackLines,
    trackHeight,
    beatLines,
    measureLines,
  } = useMemo(
    () => computeLayout(notes, config, timeSignatures, qpm),
    [notes, config, timeSignatures, qpm]
  );
  const stripeTextures = useMemo(() => {
    const getHex = (note: string) => getNoteColorForNoteName(note) ?? "#9aa0a6";
    const textures = new Map<string, Texture>();
    textures.set("C#", createStripeTexture(getHex("C"), getHex("D")));
    textures.set("D#", createStripeTexture(getHex("D"), getHex("E")));
    textures.set("F#", createStripeTexture(getHex("F"), getHex("G")));
    textures.set("G#", createStripeTexture(getHex("G"), getHex("A")));
    textures.set("A#", createStripeTexture(getHex("A"), getHex("B")));
    return textures;
  }, []);
  // Cache GlowFilter instances per note to avoid re-creating WebGL shaders
  const glowFilterCache = useRef(new Map<string, GlowFilter>());

  // Clean up stale filter entries when notes change
  useEffect(() => {
    const validIds = new Set(noteRects.map((n) => n.id));
    glowFilterCache.current.forEach((_, id) => {
      if (!validIds.has(id)) {
        glowFilterCache.current.delete(id);
      }
    });
  }, [noteRects]);

  // Ref for the playhead PixiJS container — position is updated
  // imperatively from the RAF loop, bypassing React re-renders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playheadContainerRef = useRef<any>(null);

  const [viewportX, setViewportX] = useState(0);
  const viewportXRef = useRef(0);
  const lastFollowMsRef = useRef<number | null>(null);
  const maxScrollX = Math.max(0, contentWidth - config.viewWidth);
  const centerOffsetX =
    contentWidth < config.viewWidth ? (config.viewWidth - contentWidth) / 2 : 0;
  const lastUserScrollMsRef = useRef<number | null>(null);

  const clampViewport = useCallback(
    (value: number) => Math.min(Math.max(value, 0), maxScrollX),
    [maxScrollX]
  );

  useEffect(() => {
    setViewportX((prev) => {
      const clamped = clampViewport(prev);
      viewportXRef.current = clamped;
      return clamped;
    });
  }, [clampViewport]);

  const dragState = useRef<{
    pointerId: number | null;
    startX: number;
    startViewportX: number;
    dragging: boolean;
  }>({ pointerId: null, startX: 0, startViewportX: 0, dragging: false });

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startViewportX: viewportX,
        dragging: true,
      };
      lastUserScrollMsRef.current = performance.now();
    },
    [viewportX]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state.dragging || state.pointerId !== event.pointerId) return;
      const delta = event.clientX - state.startX;
      const newX = clampViewport(state.startViewportX - delta);
      viewportXRef.current = newX;
      setViewportX(newX);
      lastUserScrollMsRef.current = performance.now();
    },
    [clampViewport]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragState.current.pointerId === event.pointerId) {
        dragState.current.dragging = false;
        dragState.current.pointerId = null;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    []
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      setViewportX((prev) => {
        const next = clampViewport(prev + delta);
        viewportXRef.current = next;
        return next;
      });
      lastUserScrollMsRef.current = performance.now();
    },
    [clampViewport]
  );

  const trackLineColor = useMemo(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--foreground")
      .trim();
    if (value.startsWith("#")) {
      return parseInt(value.slice(1), 16);
    }
    const numbers = value.match(/-?\d*\.?\d+/g);
    if (numbers && numbers.length >= 3) {
      const [a, b, c] = numbers.map((item) => parseFloat(item));
      if (value.includes("%")) {
        const h = ((a % 360) + 360) % 360;
        const s = Math.min(100, Math.max(0, b)) / 100;
        const l = Math.min(100, Math.max(0, c)) / 100;
        const cVal = (1 - Math.abs(2 * l - 1)) * s;
        const x = cVal * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - cVal / 2;
        let rPrime = 0;
        let gPrime = 0;
        let bPrime = 0;
        if (h < 60) {
          rPrime = cVal;
          gPrime = x;
        } else if (h < 120) {
          rPrime = x;
          gPrime = cVal;
        } else if (h < 180) {
          gPrime = cVal;
          bPrime = x;
        } else if (h < 240) {
          gPrime = x;
          bPrime = cVal;
        } else if (h < 300) {
          rPrime = x;
          bPrime = cVal;
        } else {
          rPrime = cVal;
          bPrime = x;
        }
        const r = Math.round((rPrime + m) * 255);
        const g = Math.round((gPrime + m) * 255);
        const bInt = Math.round((bPrime + m) * 255);
        return (r << 16) + (g << 8) + bInt;
      }
      return (a << 16) + (b << 8) + c;
    }
    return 0xffffff;
  }, []);
  const whiteKeyAlpha = 0.1;
  const blackKeyAlpha = 0;
  const beatLineAlpha = 0.1;
  const measureLineAlpha = 0.1;

  // Register the onTick handler — called synchronously from the engine's
  // RAF loop so playhead and viewport update in the same frame, zero lag.
  useEffect(() => {
    onTickRef.current = (timeSec: number) => {
      const cfg = config;
      const playheadX = cfg.leftPadding + timeSec * cfg.pixelsPerUnit;

      // Update playhead container position directly on the PixiJS object
      if (playheadContainerRef.current) {
        playheadContainerRef.current.x = playheadX;
      }

      // Viewport follow
      if (!followPlayhead) return;

      const nowMs = performance.now();
      const lastUserScrollMs = lastUserScrollMsRef.current;
      if (lastUserScrollMs && nowMs - lastUserScrollMs < 2000) {
        lastFollowMsRef.current = null;
        return;
      }

      const target = clampViewport(playheadX - cfg.viewWidth * 0.33);
      const prev = viewportXRef.current;

      let next: number;
      if (isAutoplay) {
        // During autoplay the playhead moves at constant speed —
        // snap the viewport directly so there is zero chase lag.
        next = target;
      } else {
        // Interactive / gate mode: smooth follow with frame-rate-independent damping
        const dtSec = lastFollowMsRef.current
          ? Math.min((nowMs - lastFollowMsRef.current) / 1000, 0.1)
          : 0;
        const damping = 8;
        const factor = dtSec > 0 ? 1 - Math.exp(-damping * dtSec) : 1;
        next = clampViewport(prev + (target - prev) * factor);
      }
      lastFollowMsRef.current = nowMs;

      if (Math.abs(next - prev) > 0.5) {
        viewportXRef.current = next;
        setViewportX(next);
      }
    };
    return () => {
      onTickRef.current = null;
    };
  }, [config, followPlayhead, isAutoplay, clampViewport, onTickRef]);

  return (
    <div
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      style={{ touchAction: "none" }}
    >
      <Stage
        width={config.viewWidth}
        height={config.viewHeight}
        options={{ antialias: true, backgroundAlpha: 0 }}
      >
        <Container x={centerOffsetX - viewportX}>
          <Graphics
            draw={(g) => {
              g.clear();
              const topY = trackLines[0]?.y ?? config.trackTopY;
              const bottomY =
                trackLines.length > 0
                  ? trackLines[trackLines.length - 1].y + trackHeight
                  : topY;
              trackLines.forEach((track) => {
                g.beginFill(
                  trackLineColor,
                  track.isBlack ? blackKeyAlpha : whiteKeyAlpha
                );
                g.drawRect(0, track.y, contentWidth, trackHeight);
                g.endFill();
              });
              g.lineStyle(1, trackLineColor, beatLineAlpha);
              beatLines.forEach((x) => {
                g.moveTo(x, topY);
                g.lineTo(x, bottomY);
              });
              g.lineStyle(2, trackLineColor, measureLineAlpha);
              measureLines.forEach((x) => {
                g.moveTo(x, topY);
                g.lineTo(x, bottomY);
              });
            }}
          />
          {noteRects.map((note) => {
            const noteColors = getNoteColorsFromMidi(note.midi);
            const lowerNeighborColors = getNoteColorsFromMidi(note.midi - 1);
            const hasGradient =
              note.accidental === "sharp" || note.accidental === "flat";
            const stripeKey = hasGradient
              ? normalizeSharpNote(midiToNoteName(note.midi))
              : null;
            const stripeTexture =
              stripeKey !== null ? stripeTextures.get(stripeKey) : null;

            const isFocused = focusedNoteIds.has(note.id);
            const isActive = activeNoteIds.has(note.id);
            const state = isFocused ? "focused" : isActive ? "active" : "idle";
            const fillColor = hasGradient
              ? lowerNeighborColors[state]
              : noteColors[state];

            const showGlow = isFocused || isActive;

            // Reuse or create a cached GlowFilter for this note
            let filter = glowFilterCache.current.get(note.id);
            if (!filter) {
              filter = new GlowFilter({
                distance: 8,
                outerStrength: 2,
                innerStrength: 0,
                color: 0,
                quality: 0.3,
                knockout: true,
              });
              glowFilterCache.current.set(note.id, filter);
            }
            // Update mutable filter properties to match current state
            filter.color = fillColor;
            filter.outerStrength = isFocused ? 3 : 2;

            return (
              <Container key={note.id} x={note.x} y={note.y - note.height / 2}>
                <Graphics
                  visible={showGlow}
                  filters={showGlow ? [filter] : []}
                  draw={(g) => {
                    g.clear();
                    if (!showGlow) return;
                    g.beginFill(fillColor);
                    g.drawRoundedRect(
                      0,
                      0,
                      note.width,
                      note.height,
                      config.noteCornerRadius
                    );
                    g.endFill();
                  }}
                />
                <Graphics
                  draw={(g) => {
                    g.clear();
                    if (stripeTexture && state === "idle") {
                      g.beginTextureFill({ texture: stripeTexture });
                    } else {
                      g.beginFill(fillColor);
                    }
                    g.drawRoundedRect(
                      0,
                      0,
                      note.width,
                      note.height,
                      config.noteCornerRadius
                    );
                    g.endFill();
                  }}
                />
              </Container>
            );
          })}
          <Container ref={playheadContainerRef}>
            <Graphics
              draw={(g) => {
                g.clear();
                const topY = trackLines[0]?.y ?? config.trackTopY;
                const bottomY =
                  trackLines.length > 0
                    ? trackLines[trackLines.length - 1].y + trackHeight
                    : topY;
                g.lineStyle(2, trackLineColor, 0.9);
                g.moveTo(0, topY);
                g.lineTo(0, bottomY);
                g.lineStyle(0);
              }}
            />
          </Container>
        </Container>
      </Stage>
    </div>
  );
}
