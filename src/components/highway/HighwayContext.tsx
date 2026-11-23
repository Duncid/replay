import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Guidance = { armed: number[]; range?: [number, number] };
const empty: Guidance = { armed: [] };
const Context = createContext({
  fullKeyboard: false, guidance: empty, bottomOcclusion: 0,
  setBottomOcclusion: (_: number) => {},
  setGuidance: (_: Guidance) => {},
  registerScroll: (_: HTMLElement | null, _kind: "keys" | "highway") => {},
  syncScroll: (_: HTMLElement) => {},
});
export function HighwayProvider({ fullKeyboard, children }: { fullKeyboard: boolean; children: ReactNode }) {
  const [bottomOcclusion, setBottomOcclusion] = useState(0);
  const [guidance, setGuidance] = useState<Guidance>(empty);
  const surfaces = useRef<{ keys?: HTMLElement | null; highway?: HTMLElement | null }>({});
  const value = useMemo(() => ({ fullKeyboard, guidance, setGuidance, bottomOcclusion, setBottomOcclusion,
    registerScroll: (node: HTMLElement | null, kind: "keys" | "highway") => { surfaces.current[kind] = node; },
    syncScroll: (source: HTMLElement) => {
      for (const node of Object.values(surfaces.current)) if (node && node !== source && node.scrollLeft !== source.scrollLeft) node.scrollLeft = source.scrollLeft;
    },
  }), [fullKeyboard, guidance, bottomOcclusion]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useHighway = () => useContext(Context);
