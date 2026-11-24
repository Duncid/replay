import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useHighway } from "./HighwayContext";

/** A single backdrop spans the fixed toolbar and horizontally scrolling rail. */
export function PianoDock({ toolbar, children, midiConnected = false, keyboardHeight = 320, showNoteRail = true }: { toolbar: ReactNode; children: ReactNode; midiConnected?: boolean; keyboardHeight?: number; showNoteRail?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const { bottomOcclusion, setBottomOcclusion } = useHighway();
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const bar = element.querySelector<HTMLElement>(".keyboard-toolbar");
    const rail = element.querySelector<HTMLElement>(".note-rail");
    const piano = element.querySelector<HTMLElement>(".piano-surface");
    const measure = () => setBottomOcclusion(rail ? rail.getBoundingClientRect().bottom - element.getBoundingClientRect().top
      : piano ? piano.getBoundingClientRect().top - element.getBoundingClientRect().top : bar?.getBoundingClientRect().height ?? 0);
    const observer = new ResizeObserver(measure);
    if (bar) observer.observe(bar);
    if (rail) observer.observe(rail);
    measure();
    return () => { observer.disconnect(); setBottomOcclusion(0); };
  }, [setBottomOcclusion, showNoteRail]);
  return <div ref={host} className="piano-dock" data-midi-connected={midiConnected} style={{ "--dock-occlusion": `${bottomOcclusion}px`, "--note-rail-height": showNoteRail ? "52px" : "0px", "--piano-key-height": `${Math.max(0, keyboardHeight - 54)}px` } as CSSProperties}>
    <div className="piano-dock__backdrop" aria-hidden="true" />
    {toolbar}
    <div className="piano-dock__keys" style={{ paddingTop: showNoteRail ? undefined : 0 }}>{children}</div>
  </div>;
}
