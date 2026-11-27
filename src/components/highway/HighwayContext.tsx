import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { pianoLayoutKey, type PianoLayout } from "../pianoLayout";

type Guidance = { armed: number[]; range?: [number, number] };
const empty: Guidance = { armed: [] };
const Context = createContext({
  practiceLayout: null as PianoLayout | null,
  setPracticeLayout: (_: PianoLayout | null) => {},
  fullKeyboard: false, guidance: empty, bottomOcclusion: 0,
  keyboardWidth: undefined as number | undefined,
  setBottomOcclusion: (_: number) => {},
  setGuidance: (_: Guidance) => {},
  registerScroll: (_: HTMLElement | null, _kind: "keys" | "highway") => {},
  syncScroll: (_: HTMLElement) => {},
});
export function HighwayProvider({ fullKeyboard, children }: { fullKeyboard: boolean; children: ReactNode }) {
  const [practiceLayout, setPracticeLayout] = useState<PianoLayout | null>(null);
  const [bottomOcclusion, setBottomOcclusion] = useState(0);
  const [guidance, setGuidance] = useState<Guidance>(empty);
  const [keyboardViewport, setKeyboardViewport] = useState<HTMLElement | null>(null);
  const [keyboardWidth, setKeyboardWidth] = useState<number>();
  const surfaces = useRef<{ keys?: HTMLElement | null; highway?: HTMLElement | null }>({});
  const registerScroll = useCallback((node: HTMLElement | null, kind: "keys" | "highway") => {
    surfaces.current[kind] = node;
    if (kind === "keys") setKeyboardViewport(node);
  }, []);
  useLayoutEffect(() => {
    if (!keyboardViewport) return;
    const measure = () => {
      const width = keyboardViewport.clientWidth;
      if (width > 0) setKeyboardWidth(width);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(keyboardViewport);
    measure();
    return () => observer.disconnect();
  }, [keyboardViewport]);
  const layoutKey = practiceLayout ? pianoLayoutKey(practiceLayout) : "default";
  useLayoutEffect(() => {
    for (const node of Object.values(surfaces.current)) if (node) node.scrollLeft = 0;
  }, [layoutKey]);
  const value = useMemo(() => ({ practiceLayout, setPracticeLayout, fullKeyboard, guidance, setGuidance, bottomOcclusion, setBottomOcclusion, keyboardWidth,
    registerScroll,
    syncScroll: (source: HTMLElement) => {
      for (const node of Object.values(surfaces.current)) if (node && node !== source && node.scrollLeft !== source.scrollLeft) node.scrollLeft = source.scrollLeft;
    },
  }), [practiceLayout, fullKeyboard, guidance, bottomOcclusion, keyboardWidth, registerScroll]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useHighway = () => useContext(Context);
