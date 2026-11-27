import { createContext, useContext } from "react";

export type GuestEntryPhase = "idle" | "preparing" | "animating";
export const GuestEntryContext = createContext({
  phase: "idle" as GuestEntryPhase,
  preload: () => {},
  begin: (_source: HTMLElement): boolean => false,
});
export const useGuestEntry = () => useContext(GuestEntryContext);
