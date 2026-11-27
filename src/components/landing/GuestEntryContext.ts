import { createContext, useContext } from "react";

export type GuestEntryPhase = "idle" | "preparing" | "animating";
export const GuestEntryContext = createContext({
  phase: "idle" as GuestEntryPhase,
  keyboardWidth: undefined as number | undefined,
  setPreviewPitches: (_pitches: readonly number[]) => {},
  preload: () => {},
  begin: (_source: HTMLElement): boolean => false,
});
export const useGuestEntry = () => useContext(GuestEntryContext);
