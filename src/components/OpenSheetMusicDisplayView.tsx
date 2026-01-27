import { getNoteColorForNoteName } from "@/constants/noteColors";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef } from "react";

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
  className?: string;
  style?: React.CSSProperties;
}

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

export const OpenSheetMusicDisplayView = ({
  xml,
  compactness = "compactlight",
  hasColor = false,
  className,
  style,
}: OpenSheetMusicDisplayViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const themeColorsRef = useRef<{ background: string; accent: string } | null>(
    null,
  );

  useEffect(() => {
    let observer: MutationObserver | null = null;

    if (!xml || !containerRef.current) return undefined;
    const container = containerRef.current;

    const resolveThemeColors = (host: HTMLDivElement) => {
      const probe = document.createElement("div");
      probe.className = "bg-background text-foreground";
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      host.appendChild(probe);
      const styles = getComputedStyle(probe);
      const background = styles.backgroundColor;
      const accent = styles.color;
      probe.remove();
      return { background, accent };
    };

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
        if (className.includes("vf-stem") || className.includes("vf-notehead"))
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
          (element.getAttribute("class") ?? "").includes("vf-stem"),
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

        observer = new MutationObserver(() => {
          const currentSvg = container.querySelector("svg");
          if (currentSvg && themeColorsRef.current) {
            applyThemeColors(currentSvg, themeColorsRef.current);
          }
        });
        observer.observe(container, { childList: true, subtree: true });
        osmdRef.current = osmd;
      } catch (error) {
        console.error("[OpenSheetMusicDisplayView] OSMD error:", error);
      }
    };

    initOsmd();

    return () => {
      if (observer) observer.disconnect();
      osmdRef.current = null;
    };
  }, [xml, compactness, hasColor]);

  if (!xml) return null;

  return <div ref={containerRef} className={className} style={style} />;
};
