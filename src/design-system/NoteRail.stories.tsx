import type { Meta, StoryObj } from "@storybook/react-vite";
import { NoteRail, type RailNoteState } from "@/components/NoteRail";
import { createPianoLayout } from "@/components/pianoLayout";
const layout = createPianoLayout(false);
const states = Object.fromEntries(layout.notes.map(n => [`${n.note}${n.octave}`, { label: `${n.note}${n.octave}`, playable: true, activity: undefined }])) as Record<string, RailNoteState>;
const meta = {
  title: "Instruments/Note rail", component: NoteRail, args: { layout, states },
  parameters: { docs: { description: { component: "A decorative 52 px pitch rail: two 24 px rows separated by 2 px, with a 2 px bottom gap. Cells show note names only; octave numbers sit above each B–C (Si–Do) junction. It uses exactly the piano’s tracks, gaps and black-key columns. Pitch colors identify notes; a lime/blue bottom bar identifies player/playback. The key buttons carry accessible names. Full keyboard and solfège examples live in Piano keyboard." } } },
} satisfies Meta<typeof NoteRail>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Idle: Story = {};
export const PlayerAndPlayback: Story = { args: { states: { ...states,
  C4: { ...states.C4, activity: "user" }, E4: { ...states.E4, activity: "user" },
  "F#4": { ...states["F#4"], activity: "user" }, G3: { ...states.G3, activity: "ai" },
  "A#3": { ...states["A#3"], activity: "ai" }, D5: { ...states.D5, activity: "ai" },
} } };
export const OutsideRange: Story = { args: { states: Object.fromEntries(Object.entries(states).map(([key, state]) => [key, { ...state, playable: key.endsWith("4") }])) } };
