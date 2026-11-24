import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { pianoLayoutKey, type PianoLayout } from "../pianoLayout";

type Guidance = { armed: number[]; range?: [number, number] };
const empty: Guidance = { armed: [] };
const Context = createContext({
  practiceLayout: null as PianoLayout | null,
  setPracticeLayout: (_: PianoLayout | null) => {},
  fullKeyboard: false, guidance: empty, bottomOcclusion: 0,
  setBottomOcclusion: (_: number) => {},
  setGuidance: (_: Guidance) => {},
  registerScroll: (_: HTMLElement | null, _kind: "keys" | "highway") => {},
  syncScroll: (_: HTMLElement) => {},
});
export function HighwayProvider({ fullKeyboard, children }: { fullKeyboard: boolean; children: ReactNode }) {
  const [practiceLayout, setPracticeLayout] = useState<PianoLayout | null>(null);
  const [bottomOcclusion, setBottomOcclusion] = useState(0);
  const [guidance, setGuidance] = useState<Guidance>(empty);
  const surfaces = useRef<{ keys?: HTMLElement | null; highway?: HTMLElement | null }>({});
  const layoutKey = practiceLayout ? pianoLayoutKey(practiceLayout) : "default";
  useLayoutEffect(() => {
    for (const node of Object.values(surfaces.current)) if (node) node.scrollLeft = 0;
  }, [layoutKey]);
  const value = useMemo(() => ({ practiceLayout, setPracticeLayout, fullKeyboard, guidance, setGuidance, bottomOcclusion, setBottomOcclusion,
    registerScroll: (node: HTMLElement | null, kind: "keys" | "highway") => { surfaces.current[kind] = node; },
    syncScroll: (source: HTMLElement) => {
      for (const node of Object.values(surfaces.current)) if (node && node !== source && node.scrollLeft !== source.scrollLeft) node.scrollLeft = source.scrollLeft;
    },
  }), [practiceLayout, fullKeyboard, guidance, bottomOcclusion]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useHighway = () => useContext(Context);
