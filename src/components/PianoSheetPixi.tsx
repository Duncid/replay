import { getNoteColorForNoteName } from "@/constants/noteColors";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import { WRAP_MODES } from "@pixi/constants";
import { Texture } from "@pixi/core";
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

function getNoteColorFromMidi(midi: number) {
  const noteName = midiToNoteName(midi);
  const hex = getNoteColorForNoteName(noteName);
  if (!hex) return 0x9aa0a6;
  return parseInt(hex.replace("#", ""), 16);
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
  const lineWidth = 3;
  const block = lineWidth * 4;
  const size = block;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.EMPTY;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = stripeHex;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "butt";

  for (let offset = -block; offset <= block; offset += block / 2) {
    ctx.beginPath();
    ctx.moveTo(offset - block / 2, -block / 2);
    ctx.lineTo(offset + block + block / 2, block + block / 2);
    ctx.stroke();
  }

  const texture = Texture.from(canvas);
  texture.baseTexture.wrapMode = WRAP_MODES.REPEAT;
  return texture;
}

interface PianoSheetPixiProps {
  notes: NoteEvent[];
  config: SheetConfig;
}

export function PianoSheetPixi({ notes, config }: PianoSheetPixiProps) {
  const { contentWidth, noteRects, staffLines } = useMemo(
    () => computeLayout(notes, config),
    [notes, config]
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
    },
    [viewportX]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state.dragging || state.pointerId !== event.pointerId) return;
      const delta = event.clientX - state.startX;
      setViewportX(clampViewport(state.startViewportX - delta));
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
    },
    [clampViewport]
  );

  const staffLineColor = useMemo(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--foreground")
      .trim();
    if (value.startsWith("#")) {
      return parseInt(value.slice(1), 16);
    }
    const match = value.match(/(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (match) {
      const [, r, g, b] = match;
      return (parseInt(r, 10) << 16) + (parseInt(g, 10) << 8) + parseInt(b, 10);
    }
    return 0xffffff;
  }, []);
  const staffLineAlpha = 0.2;
  const extendedLineAlpha = 0.1;

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
              g.lineStyle(2, staffLineColor, extendedLineAlpha);
              staffLines.treble.ledger.forEach((y) => {
                g.moveTo(0, y);
                g.lineTo(contentWidth, y);
              });
              staffLines.bass?.ledger.forEach((y) => {
                g.moveTo(0, y);
                g.lineTo(contentWidth, y);
              });
              g.lineStyle(2, staffLineColor, staffLineAlpha);
              staffLines.treble.classic.forEach((y) => {
                g.moveTo(0, y);
                g.lineTo(contentWidth, y);
              });
              staffLines.bass?.classic.forEach((y) => {
                g.moveTo(0, y);
                g.lineTo(contentWidth, y);
              });
            }}
          />
          {noteRects.map((note) => {
            const baseColor = getNoteColorFromMidi(note.midi);
            const lowerNeighborColor = getNoteColorFromMidi(note.midi - 1);
            const upperNeighborColor = getNoteColorFromMidi(note.midi + 1);
            const hasGradient =
              note.accidental === "sharp" || note.accidental === "flat";
            const stripeKey = hasGradient
              ? normalizeSharpNote(midiToNoteName(note.midi))
              : null;
            const stripeTexture =
              stripeKey !== null ? stripeTextures.get(stripeKey) : null;

            return (
              <Container key={note.id} x={note.x} y={note.y - note.height / 2}>
                <Graphics
                  draw={(g) => {
                    g.clear();
                    if (stripeTexture) {
                      g.beginTextureFill({ texture: stripeTexture });
                    } else if (hasGradient) {
                      g.beginFill(lowerNeighborColor);
                    } else {
                      g.beginFill(baseColor);
                    }
                    g.drawRoundedRect(
                      0,
                      0,
                      note.width,
                      note.height,
                      config.noteCornerRadius
                    );
                    g.endFill();
                    const strokeColor = hasGradient
                      ? lowerNeighborColor
                      : baseColor;
                    g.lineStyle({
                      width: 2,
                      color: strokeColor,
                      alpha: 0.4,
                      alignment: 0.5,
                    });
                    g.drawRoundedRect(
                      -1,
                      -1,
                      note.width + 2,
                      note.height + 2,
                      config.noteCornerRadius + 1
                    );
                    g.lineStyle(0);
                  }}
                />
              </Container>
            );
          })}
        </Container>
      </Stage>
    </div>
  );
}
