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

interface PianoSheetPixiProps {
  notes: NoteEvent[];
  config: SheetConfig;
  timeSignatures?: TimeSignature[];
  qpm?: number;
  playheadTime?: number;
  focusedNoteIds?: Set<string>;
  activeNoteIds?: Set<string>;
  followPlayhead?: boolean;
}

export function PianoSheetPixi({
  notes,
  config,
  timeSignatures,
  qpm,
  playheadTime = 0,
  focusedNoteIds = new Set(),
  activeNoteIds = new Set(),
  followPlayhead = false,
}: PianoSheetPixiProps) {
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
  const [viewportX, setViewportX] = useState(0);
  const maxScrollX = Math.max(0, contentWidth - config.viewWidth);
  const lastUserScrollMsRef = useRef<number | null>(null);

  const clampViewport = useCallback(
    (value: number) => Math.min(Math.max(value, 0), maxScrollX),
    [maxScrollX]
  );

  useEffect(() => {
    setViewportX((prev) => clampViewport(prev));
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
      setViewportX(clampViewport(state.startViewportX - delta));
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
      setViewportX((prev) => clampViewport(prev + delta));
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

  useEffect(() => {
    if (!followPlayhead) return;
    const nowMs = performance.now();
    const lastUserScrollMs = lastUserScrollMsRef.current;
    if (lastUserScrollMs && nowMs - lastUserScrollMs < 2000) return;
    const playheadX = config.leftPadding + playheadTime * config.pixelsPerUnit;
    const targetViewportX = clampViewport(playheadX - config.viewWidth * 0.33);
    setViewportX((prev) => {
      const next = prev + (targetViewportX - prev) * 0.12;
      return clampViewport(next);
    });
  }, [
    clampViewport,
    config.leftPadding,
    config.pixelsPerUnit,
    config.viewWidth,
    followPlayhead,
    playheadTime,
  ]);

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
        <Container x={-viewportX}>
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
            const glowFilter =
              isFocused || isActive
                ? new GlowFilter({
                    distance: isFocused ? 8 : 6,
                    outerStrength: isFocused ? 3 : 2,
                    innerStrength: 0,
                    color: fillColor,
                    quality: 0.3,
                    knockout: true,
                  })
                : null;

            return (
              <Container key={note.id} x={note.x} y={note.y - note.height / 2}>
                {glowFilter && (
                  <Graphics
                    filters={[glowFilter]}
                    draw={(g) => {
                      g.clear();
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
                )}
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
          <Graphics
            draw={(g) => {
              g.clear();
              const topY = trackLines[0]?.y ?? config.trackTopY;
              const bottomY =
                trackLines.length > 0
                  ? trackLines[trackLines.length - 1].y + trackHeight
                  : topY;
              const x =
                config.leftPadding + playheadTime * config.pixelsPerUnit;
              g.lineStyle(2, trackLineColor, 0.9);
              g.moveTo(x, topY);
              g.lineTo(x, bottomY);
              g.lineStyle(0);
            }}
          />
        </Container>
      </Stage>
    </div>
  );
}
