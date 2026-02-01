import { getNoteColorForNoteName } from "@/constants/noteColors";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import { CursorType, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

type Compactness =
  | "default"
  | "compactlight"
  | "compact"
  | "compacttight"
  | string;

interface OpenSheetMusicDisplayViewProps {
  xml: string | null;
  compactness?: Compactness;
  hasColor?: boolean;
  onOsmdReady?: (osmd: OpenSheetMusicDisplay) => void;
  cursorColor?: string;
  onCursorElementReady?: (cursorElement: HTMLImageElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
}

export type OpenSheetMusicDisplayViewHandle = {
  setCursorColor: (color: string | null) => void;
};

type OsmdPitch = {
  Octave?: number;
  octave?: number;
  HalfTone?: number;
  halfTone?: number;
};

type OsmdNote = {
  pitch?: number | OsmdPitch;
  midi?: number;
  Pitch?: OsmdPitch;
  noteheadColor?: string;
};

type OsmdVoiceEntry = {
  Notes?: OsmdNote[];
};

type OsmdStaffEntry = {
  VoiceEntries?: OsmdVoiceEntry[];
};

type OsmdContainer = {
  StaffEntries?: OsmdStaffEntry[];
};

type OsmdMeasure = {
  VerticalSourceStaffEntryContainers?: OsmdContainer[];
};

type OsmdScore = {
  SourceMeasures?: OsmdMeasure[];
};

const getMidiFromOsmdNote = (note: OsmdNote | null): number | null => {
  if (!note) return null;
  if (typeof note.pitch === "number") return note.pitch;
  if (typeof note.midi === "number") return note.midi;

  const pitch =
    note.Pitch ??
    (note.pitch && typeof note.pitch === "object" ? note.pitch : null);
  if (!pitch) return null;

  const octave =
    typeof pitch.Octave === "number"
      ? pitch.Octave
      : typeof pitch.octave === "number"
      ? pitch.octave
      : null;
  const halfTone =
    typeof pitch.HalfTone === "number"
      ? pitch.HalfTone
      : typeof pitch.halfTone === "number"
      ? pitch.halfTone
      : null;

  if (octave === null || halfTone === null) return null;
  return (octave + 1) * 12 + halfTone;
};

export const OpenSheetMusicDisplayView = forwardRef<
  OpenSheetMusicDisplayViewHandle,
  OpenSheetMusicDisplayViewProps
>(
  (
    {
      xml,
      compactness = "compactlight",
      hasColor = false,
      onOsmdReady,
      cursorColor,
      onCursorElementReady,
      className,
      style,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
    const themeColorsRef = useRef<{
      background: string;
      accent: string;
    } | null>(null);
    const cursorStyleRetryRef = useRef<number | null>(null);
    const cursorElementRef = useRef<HTMLImageElement | null>(null);
    const cursorColorRef = useRef<string | null>(null);

    useEffect(() => {
      const styleId = "osmd-cursor-pulse-style";
      if (document.getElementById(styleId)) return;
      const styleTag = document.createElement("style");
      styleTag.id = styleId;
      styleTag.textContent = `
        @keyframes osmdCursorPulse {
          0% { box-shadow: 0 0 0 1px var(--osmd-cursor-ring-color); }
          50% { box-shadow: 0 0 0 4px var(--osmd-cursor-ring-color); }
          100% { box-shadow: 0 0 0 1px var(--osmd-cursor-ring-color); }
        }
      `;
      document.head.appendChild(styleTag);
    }, []);

    const notifyCursorElement = useCallback(
      (nextElement: HTMLImageElement | null) => {
        if (cursorElementRef.current === nextElement) return;
        cursorElementRef.current = nextElement;
        onCursorElementReady?.(nextElement);
      },
      [onCursorElementReady],
    );

    const resolveThemeColors = useCallback((host: HTMLDivElement) => {
      const probe = document.createElement("div");
      probe.className = "bg-background text-foreground";
      // probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      host.appendChild(probe);
      const styles = getComputedStyle(probe);
      const background = styles.backgroundColor;
      const accent = styles.color;
      probe.remove();
      return { background, accent };
    }, []);

    const withAlpha = useCallback((color: string, alpha: number) => {
      const normalized = color.trim();
      if (normalized.startsWith("rgba(")) {
        return normalized.replace(
          /rgba\(([^)]+),\s*[\d.]+\)/,
          `rgba($1, ${alpha})`,
        );
      }
      if (normalized.startsWith("rgb(")) {
        return normalized.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
      }
      if (normalized.startsWith("#")) {
        const hex = normalized.slice(1);
        const value =
          hex.length === 3
            ? hex
                .split("")
                .map((ch) => ch + ch)
                .join("")
            : hex.length >= 6
            ? hex.slice(0, 6)
            : null;
        if (value) {
          const r = Number.parseInt(value.slice(0, 2), 16);
          const g = Number.parseInt(value.slice(2, 4), 16);
          const b = Number.parseInt(value.slice(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
      return color;
    }, []);

    const applyCursorStyle = useCallback(() => {
      const cursor = osmdRef.current?.cursor as
        | unknown
        | {
            cursorElement?: HTMLImageElement;
            wantedZIndex?: string;
            CursorOptions?: {
              type?: CursorType;
              color?: string;
              alpha?: number;
              follow?: boolean;
            };
          };
      if (cursor && typeof cursor === "object") {
        (cursor as { wantedZIndex?: string }).wantedZIndex = "10";
      }
      const cursorElement = (cursor as { cursorElement?: HTMLImageElement })
        ?.cursorElement as HTMLImageElement | undefined;
      if (!cursorElement) {
        notifyCursorElement(null);
        if (cursorStyleRetryRef.current === null) {
          cursorStyleRetryRef.current = window.requestAnimationFrame(() => {
            cursorStyleRetryRef.current = null;
            applyCursorStyle();
          });
        }
        return;
      }
      notifyCursorElement(cursorElement);
      if (cursorStyleRetryRef.current !== null) {
        window.cancelAnimationFrame(cursorStyleRetryRef.current);
        cursorStyleRetryRef.current = null;
      }
      if (!themeColorsRef.current && containerRef.current) {
        themeColorsRef.current = resolveThemeColors(containerRef.current);
      }
      const accent = themeColorsRef.current?.accent ?? "currentColor";
      const resolvedCursorColor =
        cursorColorRef.current ?? cursorColor ?? accent;
      if (cursor && typeof cursor === "object") {
        const currentOptions = (cursor as { CursorOptions?: object })
          .CursorOptions;
        (cursor as { CursorOptions?: object }).CursorOptions = {
          ...(currentOptions ?? {}),
          type: CursorType.ThinLeft,
          color: accent,
          alpha: 0.01,
        };
      }
      const baseStyle: React.CSSProperties = {
        backgroundColor: "transparent",
        border: `1.5px solid ${withAlpha(resolvedCursorColor, 0.9)}`,
        borderRadius: "12px",
        height: "88px",
        width: "32px",
        minWidth: "32px",
        opacity: 0.8,
        transform: "translateY(-24px)",
        pointerEvents: "none",
        zIndex: 10,
      };
      cursorElement.style.setProperty(
        "--osmd-cursor-ring-color",
        withAlpha(resolvedCursorColor, 0.7),
      );
      cursorElement.style.animation = "osmdCursorPulse 2s ease-in-out infinite";
      cursorElement.style.boxShadow = "0 0 0 1px var(--osmd-cursor-ring-color)";
      Object.assign(cursorElement.style, baseStyle);
    }, [resolveThemeColors, cursorColor, notifyCursorElement, withAlpha]);

    useImperativeHandle(
      ref,
      () => ({
        setCursorColor: (color: string | null) => {
          cursorColorRef.current = color;
          applyCursorStyle();
        },
      }),
      [applyCursorStyle],
    );

    useEffect(() => {
      let observer: MutationObserver | null = null;

      if (!xml || !containerRef.current) return undefined;
      const container = containerRef.current;

      const applyThemeColors = (
        svg: SVGSVGElement,
        colors: { background: string; accent: string },
      ) => {
        svg.style.background = colors.background;
        svg.style.color = colors.accent;

        svg.querySelectorAll("rect").forEach((rect) => {
          const isBackground =
            rect.getAttribute("class")?.includes("osmdPage") ?? false;
          if (isBackground) {
            rect.setAttribute("fill", colors.background);
            rect.setAttribute("stroke", "none");
            rect.removeAttribute("fill-opacity");
            rect.removeAttribute("stroke-opacity");
            return;
          }
          const fill = rect.getAttribute("fill");
          const stroke = rect.getAttribute("stroke");
          if (fill && fill !== "none") {
            rect.setAttribute("fill", colors.accent);
            rect.setAttribute("fill-opacity", "0.3");
          }
          if (stroke && stroke !== "none") {
            rect.setAttribute("stroke", colors.accent);
            rect.setAttribute("stroke-opacity", "0.3");
          }
        });

        const isStaffLineShape = (element: Element) => {
          const tag = element.tagName.toLowerCase();
          if (tag !== "path" && tag !== "line") return false;
          const className = element.getAttribute("class") ?? "";
          if (
            className.includes("vf-stem") ||
            className.includes("vf-notehead")
          )
            return false;
          const parent = element.closest(
            "g.staffline, g.vf-measure, g.vf-ledgers",
          );
          if (!parent) return false;
          const excludedAncestor = element.closest(
            "g.vf-stavenote, g.vf-note, g.vf-stem, g.vf-beam, g.vf-clef, g.vf-timesignature, g.vf-modifiers, g.vf-text",
          );
          if (excludedAncestor) return false;
          const fill = element.getAttribute("fill");
          const stroke = element.getAttribute("stroke");
          const strokeWidth = Number.parseFloat(
            element.getAttribute("stroke-width") ?? "0",
          );
          return (
            fill === "none" && stroke && stroke !== "none" && strokeWidth <= 1
          );
        };

        const isNoteElement = (element: Element) =>
          Boolean(
            element.closest("g.vf-stavenote, g.vf-note") ||
              (element.getAttribute("class") ?? "").includes("vf-notehead") ||
              (element.getAttribute("class") ?? "").includes("vf-stem") ||
              (element.getAttribute("class") ?? "").includes("vf-flag") ||
              element.closest("g.vf-flag"),
          );

        const isStemElement = (element: Element) =>
          Boolean(
            element.closest("g.vf-stem") ||
              (element.getAttribute("class") ?? "").includes("vf-stem"),
          );

        const isNoteheadElement = (element: Element) =>
          Boolean(
            element.closest("g.vf-notehead") ||
              (element.getAttribute("class") ?? "").includes("vf-notehead"),
          );

        const isModifierElement = (element: Element) =>
          Boolean(
            element.closest("g.vf-modifiers") ||
              (element.getAttribute("class") ?? "").includes("vf-modifiers"),
          );

        const isFlagElement = (element: Element) =>
          Boolean(
            element.closest("g.vf-flag") ||
              (element.getAttribute("class") ?? "").includes("vf-flag"),
          );

        svg.querySelectorAll("line").forEach((line) => {
          const staffLine = isStaffLineShape(line);
          if (staffLine) {
            line.setAttribute("stroke", colors.accent);
            line.setAttribute("stroke-opacity", "0.3");
            return;
          }
          if (line.getAttribute("stroke")) {
            line.setAttribute("stroke", colors.accent);
            line.removeAttribute("stroke-opacity");
          }
        });

        const isBlackColor = (value: string) => {
          const normalized = value.trim().toLowerCase();
          if (!normalized) return false;
          if (normalized === "black") return true;
          if (normalized.startsWith("#")) {
            const hex = normalized.slice(1);
            if (hex.length === 3) {
              return hex === "000";
            }
            if (hex.length === 6 || hex.length === 8) {
              return hex.slice(0, 6) === "000000";
            }
            return false;
          }
          return /rgba?\(\s*0\s*,\s*0\s*,\s*0(?:\s*,\s*1(?:\.0+)?)?\s*\)/.test(
            normalized,
          );
        };

        svg
          .querySelectorAll("path, polyline, polygon, circle, ellipse")
          .forEach((shape) => {
            const staffLine = isStaffLineShape(shape);
            if (staffLine) {
              shape.setAttribute("stroke", colors.accent);
              shape.setAttribute("stroke-opacity", "0.3");
              shape.setAttribute("fill", "none");
              return;
            }

            if (isStemElement(shape)) {
              if (shape.getAttribute("stroke")) {
                shape.setAttribute("stroke", colors.accent);
              } else {
                shape.setAttribute("stroke", colors.accent);
              }
              shape.removeAttribute("stroke-opacity");
              return;
            }

            if (isNoteheadElement(shape)) {
              const fill = shape.getAttribute("fill");
              const normalizedFill = (fill ?? "").trim().toLowerCase();
              const isTransparentFill =
                !normalizedFill ||
                normalizedFill === "none" ||
                normalizedFill === "transparent" ||
                normalizedFill === "#0000" ||
                normalizedFill === "#00000000" ||
                normalizedFill.endsWith(", 0)") ||
                normalizedFill.endsWith(",0)");
              const isDefaultFill =
                isTransparentFill || isBlackColor(normalizedFill);
              if (hasColor && !isDefaultFill) {
                return;
              }
              shape.setAttribute("fill", colors.accent);
              shape.setAttribute("stroke", colors.accent);
              shape.setAttribute("stroke-width", "0.8");
              shape.removeAttribute("stroke-opacity");
              return;
            }

            if (isModifierElement(shape)) {
              const fill = shape.getAttribute("fill");
              const stroke = shape.getAttribute("stroke");
              if (fill && fill !== "none") {
                shape.setAttribute("fill", colors.accent);
              }
              if (stroke && stroke !== "none") {
                shape.setAttribute("stroke", colors.accent);
                shape.removeAttribute("stroke-opacity");
              }
              if (!fill && !stroke) {
                shape.setAttribute("fill", colors.accent);
              }
              return;
            }

            if (isFlagElement(shape)) {
              shape.setAttribute("fill", colors.accent);
              shape.setAttribute("stroke", colors.accent);
              shape.removeAttribute("stroke-opacity");
              shape.removeAttribute("fill-opacity");
              return;
            }

            if (hasColor && isNoteElement(shape)) {
              return;
            }

            const fill = shape.getAttribute("fill");
            const stroke = shape.getAttribute("stroke");
            if (fill && fill !== "none") {
              shape.setAttribute("fill", colors.accent);
            }
            if (stroke && stroke !== "none") {
              shape.setAttribute("stroke", colors.accent);
              shape.removeAttribute("stroke-opacity");
            }
            if (!fill && !stroke) {
              shape.setAttribute("fill", colors.accent);
            }
          });

        svg.querySelectorAll("text").forEach((textNode) => {
          textNode.setAttribute("fill", colors.accent);
        });
      };

      const applyPerNoteColors = (osmd: OpenSheetMusicDisplay) => {
        const score = osmd.Sheet as unknown as OsmdScore | undefined;
        const measures = score?.SourceMeasures ?? [];
        measures.forEach((measure) => {
          const containers = measure?.VerticalSourceStaffEntryContainers ?? [];
          containers.forEach((container) => {
            const staffEntries = container?.StaffEntries ?? [];
            staffEntries.forEach((staffEntry) => {
              const voiceEntries = staffEntry?.VoiceEntries ?? [];
              voiceEntries.forEach((voiceEntry) => {
                const notes = voiceEntry?.Notes ?? [];
                notes.forEach((note) => {
                  const midi = getMidiFromOsmdNote(note);
                  if (midi === null) return;
                  const color = getNoteColorForNoteName(midiToNoteName(midi));
                  if (!color) return;
                  note.noteheadColor = color;
                });
              });
            });
          });
        });
      };

      const initOsmd = async () => {
        try {
          const options: Record<string, unknown> = {
            drawTitle: false,
            drawComposer: false,
            drawPartNames: false,
            drawMetronomeMarks: false,
          };
          if (compactness && compactness !== "default") {
            options.drawingParameters = compactness;
          }

          const osmd = new OpenSheetMusicDisplay(container, options);
          await osmd.load(xml);
          if (hasColor) {
            applyPerNoteColors(osmd);
          }
          osmd.render();

          const svgRoot = container.querySelector("svg");
          if (!themeColorsRef.current) {
            themeColorsRef.current = resolveThemeColors(container);
          }
          if (svgRoot && themeColorsRef.current) {
            applyThemeColors(svgRoot, themeColorsRef.current);
          }
          applyCursorStyle();

          observer = new MutationObserver(() => {
            const currentSvg = container.querySelector("svg");
            if (currentSvg && themeColorsRef.current) {
              applyThemeColors(currentSvg, themeColorsRef.current);
            }
            applyCursorStyle();
          });
          observer.observe(container, { childList: true, subtree: true });
          osmdRef.current = osmd;
          onOsmdReady?.(osmd);
        } catch (error) {
          console.error("[OpenSheetMusicDisplayView] OSMD error:", error);
        }
      };

      initOsmd();

      return () => {
        if (observer) observer.disconnect();
        osmdRef.current = null;
        notifyCursorElement(null);
      };
    }, [
      xml,
      compactness,
      hasColor,
      onOsmdReady,
      applyCursorStyle,
      resolveThemeColors,
      notifyCursorElement,
    ]);

    useEffect(() => {
      applyCursorStyle();
    }, [applyCursorStyle]);

    if (!xml) return null;

    return <div ref={containerRef} className={className} style={style} />;
  },
);
