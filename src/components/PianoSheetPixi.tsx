import { Container, Graphics, Stage } from "@pixi/react";
import { Texture } from "pixi.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { getNoteColorForNoteName } from "@/constants/noteColors";
import { midiToNoteName } from "@/utils/noteSequenceUtils";

export type Accidental = "sharp" | "flat" | "natural" | null;

export interface NoteEvent {
  id: string;
  midi: number;
  start: number;
  dur: number;
  accidental?: Accidental;
}

export interface SheetConfig {
  pixelsPerUnit: number;
  noteHeight: number;
  noteCornerRadius: number;
  staffLineGap: number;
  staffTopY: number;
  leftPadding: number;
  rightPadding: number;
  viewWidth: number;
  viewHeight: number;
  minNoteWidth: number;
  midiRef: number;
}

export interface NoteRect {
  id: string;
  midi: number;
  x: number;
  y: number;
  width: number;
  height: number;
  accidental: Accidental;
}

export function computeLayout(notes: NoteEvent[], config: SheetConfig) {
  const staffBottomLineY = config.staffTopY + 4 * config.staffLineGap;
  let maxEnd = 0;

  const noteRects: NoteRect[] = notes.map((note) => {
    const end = note.start + note.dur;
    maxEnd = Math.max(maxEnd, end);

    const staffStep = (note.midi - config.midiRef) * 0.5;
    const y =
      staffBottomLineY - staffStep * (config.staffLineGap / 2);
    const width = Math.max(config.minNoteWidth, note.dur * config.pixelsPerUnit);
    const x = config.leftPadding + note.start * config.pixelsPerUnit;

    const noteName = midiToNoteName(note.midi);
    const inferredAccidental = noteName.includes("#") ? "sharp" : null;

    return {
      id: note.id,
      midi: note.midi,
      x,
      y,
      width,
      height: config.noteHeight,
      accidental: note.accidental ?? inferredAccidental,
    };
  });

  const contentWidth =
    config.leftPadding + maxEnd * config.pixelsPerUnit + config.rightPadding;

  return { contentWidth, noteRects };
}

const gradientTextureCache = new Map<string, Texture>();

function toHexColor(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function makeGradientTexture(baseColor: number, neighborColor: number) {
  const key = `${baseColor}-${neighborColor}`;
  const cached = gradientTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = Texture.EMPTY;
    gradientTextureCache.set(key, fallback);
    return fallback;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, toHexColor(baseColor));
  gradient.addColorStop(1, toHexColor(neighborColor));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = Texture.from(canvas);
  gradientTextureCache.set(key, texture);
  return texture;
}

function getNoteColorFromMidi(midi: number) {
  const noteName = midiToNoteName(midi);
  const hex = getNoteColorForNoteName(noteName);
  if (!hex) return 0x9aa0a6;
  return parseInt(hex.replace("#", ""), 16);
}

interface PianoSheetPixiProps {
  notes: NoteEvent[];
  config: SheetConfig;
}

export function PianoSheetPixi({ notes, config }: PianoSheetPixiProps) {
  const { contentWidth, noteRects } = useMemo(
    () => computeLayout(notes, config),
    [notes, config],
  );
  const [viewportX, setViewportX] = useState(0);
  const maxScrollX = Math.max(0, contentWidth - config.viewWidth);

  const clampViewport = useCallback(
    (value: number) => Math.min(Math.max(value, 0), maxScrollX),
    [maxScrollX],
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
    },
    [viewportX],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state.dragging || state.pointerId !== event.pointerId) return;
      const delta = event.clientX - state.startX;
      setViewportX(clampViewport(state.startViewportX - delta));
    },
    [clampViewport],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragState.current.pointerId === event.pointerId) {
        dragState.current.dragging = false;
        dragState.current.pointerId = null;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      setViewportX((prev) => clampViewport(prev + delta));
    },
    [clampViewport],
  );

  const staffLines = useMemo(() => {
    const positions = Array.from({ length: 5 }, (_, index) => {
      return config.staffTopY + index * config.staffLineGap;
    });
    return positions;
  }, [config.staffTopY, config.staffLineGap]);

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
              g.lineStyle(1, 0x5f6368, 0.6);
              staffLines.forEach((y) => {
                g.moveTo(0, y);
                g.lineTo(contentWidth, y);
              });
            }}
          />
          {noteRects.map((note) => {
            const baseColor = getNoteColorFromMidi(note.midi);
            const neighborColor =
              note.accidental === "flat"
                ? getNoteColorFromMidi(note.midi - 1)
                : getNoteColorFromMidi(note.midi + 1);
            const hasGradient =
              note.accidental === "sharp" || note.accidental === "flat";
            const texture = hasGradient
              ? makeGradientTexture(baseColor, neighborColor)
              : null;

            return (
              <Graphics
                key={note.id}
                x={note.x}
                y={note.y - note.height / 2}
                draw={(g) => {
                  g.clear();
                  if (hasGradient && texture) {
                    g.beginTextureFill({ texture });
                  } else {
                    g.beginFill(baseColor);
                  }
                  g.drawRoundedRect(
                    0,
                    0,
                    note.width,
                    note.height,
                    config.noteCornerRadius,
                  );
                  g.endFill();
                }}
              />
            );
          })}
        </Container>
      </Stage>
    </div>
  );
}
