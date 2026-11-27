import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { NoteHighway } from "@/components/highway/NoteHighway";
import type { HighwayTransport } from "@/components/highway/model";
import { NoteRail, type RailNoteState } from "@/components/NoteRail";
import { PianoKey } from "@/components/PianoKey";
import { createAdaptivePianoLayout, pianoKeyStyle, pianoLayoutKey } from "@/components/pianoLayout";
import { startScreenNotes, startScreenPitches, startScreenRange } from "./startScreenScene";
import "./IPadStartScreen.css";

const ignoreInput = () => {};
export interface IPadStartScreenProps {
  beat?: number;
  logoScale?: number;
  tuneOpacity?: number;
}

/** Controlled artwork, like the landing iPad: real renderers, no account or audio. */
export function IPadStartScreen({ beat = 4.25, logoScale = 1, tuneOpacity = .65 }: IPadStartScreenProps) {
  const host = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [readiness, setReadiness] = useState("loading");
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setWidth(element.clientWidth - 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => createAdaptivePianoLayout(startScreenPitches, width), [width]);
  const activeNotes = useMemo(() => startScreenNotes.filter(note => note.start <= beat && note.start + note.duration > beat), [beat]);
  const transport = useMemo<HighwayTransport>(() => ({
    getBeat: () => beat,
    getState: () => "paused",
    getActive: () => new Set(activeNotes.map(note => note.id)),
    resetId: `start-screen:${beat}`,
  }), [beat, activeNotes]);
  const states: Record<string, RailNoteState> = Object.fromEntries(layout.notes.map(note => {
    const name = `${note.note}${note.octave}`;
    return [name, { label: name, playable: true, activity: activeNotes.find(active => active.midi === note.midi)?.who }];
  }));
  const onReadinessChange = useCallback((state: "loading" | "ready" | "error") => setReadiness(state), []);

  return <main ref={host} className="ipad-start-screen" data-scene-ready={width > 0 && readiness === "ready"}
    data-scene-status={readiness} data-scene-beat={beat} data-piano-ranges={pianoLayoutKey(layout)}
    style={{ "--start-logo-scale": logoScale, "--start-tune-opacity": tuneOpacity } as CSSProperties}>
    <div className="ipad-start-screen__space">
      <div className="ipad-start-screen__highway" aria-hidden="true" inert>
        {width > 0 && <NoteHighway layout={layout} notes={startScreenNotes} range={startScreenRange}
          pixelsPerBeat={90} transport={transport} onReadinessChange={onReadinessChange} />}
      </div>
      <div className="ipad-start-screen__brand"><h1>Noodlyn</h1></div>
    </div>
    <div className="ipad-start-screen__piano" aria-hidden="true" inert>
      <NoteRail layout={layout} states={states} />
      <div className="ipad-start-screen__keys piano-surface" data-start-screen-keys>
        {[...layout.whiteKeys, ...layout.blackKeys].map(note => {
          const name = `${note.note}${note.octave}`;
          return <PianoKey key={name} note={name} isBlack={note.isBlack} style={pianoKeyStyle(layout, note)}
            activity={states[name].activity} isPlayable disabled onPress={ignoreInput} onRelease={ignoreInput} />;
        })}
      </div>
    </div>
  </main>;
}
