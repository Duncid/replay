import type { HighwayNote } from "@/components/highway/model";

/** A small original C-major phrase, entirely player-owned: held bass and melody. */
export const startScreenNotes: HighwayNote[] = [
  { id: "bass-c", midi: 48, start: 4, duration: 2, who: "user" },
  { id: "bass-g", midi: 55, start: 4, duration: 2, who: "user" },
  { id: "melody-e", midi: 64, start: 4, duration: 1.25, who: "user" },
  { id: "melody-g", midi: 67, start: 5.5, duration: .75, who: "user" },
  { id: "melody-a", midi: 69, start: 6.5, duration: .75, who: "user" },
  { id: "melody-c", midi: 72, start: 7.5, duration: 1.25, who: "user" },
  { id: "bass-f", midi: 53, start: 8, duration: 2, who: "user" },
  { id: "melody-b", midi: 71, start: 9, duration: .75, who: "user" },
  { id: "melody-g-return", midi: 67, start: 10, duration: 1.5, who: "user" },
  { id: "melody-e-return", midi: 64, start: 12, duration: 1.5, who: "user" },
];
export const startScreenPitches = startScreenNotes.map(note => note.midi);
export const startScreenRange: [number, number] = [48, 72];
