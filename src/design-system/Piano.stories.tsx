import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import Piano from "@/components/Piano";

function KeyboardExample(args: ComponentProps<typeof Piano>) {
  const [held, setHeld] = useState<string[]>([]);
  const [lastEvent, setLastEvent] = useState("No notes played yet");
  return <section className="space-y-4" aria-label="Piano keyboard example">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-xl font-semibold">{args.fullKeyboard ? "Full piano · A0–C8" : "Practice keyboard · C3–C6"}</h2>
      <p className="text-sm text-muted-foreground">{args.allowInput ? "Click, touch, or press E for C4. Sound starts on interaction." : "Input disabled · visual preview only"}</p>
    </div>
    <div className="h-60 w-full rounded-lg border bg-card p-2">
      <Piano {...args}
        onNoteStart={(note, frequency, velocity) => {
          setHeld(previous => [...new Set([...previous, note])]);
          setLastEvent(`Pressed ${note} · ${frequency.toFixed(2)} Hz`);
          args.onNoteStart?.(note, frequency, velocity);
        }}
        onNoteEnd={(note, frequency) => {
          setHeld(previous => previous.filter(key => key !== note));
          setLastEvent(`Released ${note}`);
          args.onNoteEnd?.(note, frequency);
        }}
      />
    </div>
    <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
      <p>{held.length ? `Holding: ${held.join(", ")}` : "No keys held"}</p>
      <p>{lastEvent}</p>
    </div>
  </section>;
}

const meta = {
  title: "Instruments/Piano keyboard",
  component: Piano,
  render: args => <KeyboardExample {...args} />,
  args: {
    activeKeys: new Set<string>(), allowInput: true, soundType: "classic",
    language: "en", notationPreference: "abc", fullKeyboard: false,
  },
  argTypes: {
    activeKeys: { control: "select", options: ["None", "C major", "Sharps"], mapping: {
      None: new Set<string>(), "C major": new Set(["C4", "E4", "G4"]), Sharps: new Set(["C#4", "F#4", "A#4"]),
    }, description: "External playback highlights; MIDI enters through the player input handlers. Uses note names such as C4 and F#4, independently of displayed notation." },
    allowInput: { description: "Enables mouse, touch and mapped computer-key input. External highlights remain visible when false." },
    fullKeyboard: { description: "False: 37 notes, C3–C6. True: 88 notes, A0–C8, with internal horizontal scrolling below 1040 px." },
    notationPreference: { control: "select", options: ["auto", "abc", "solfege"], description: "Auto uses solfège for fr and letter names for other languages." },
    language: { control: "select", options: ["en", "fr"] },
    soundType: { control: false, description: "Examples use the local Patch oscillator (classic), so playing needs no sample downloads. The app defaults to acoustic-piano." },
    onNoteStart: { action: "note started" }, onNoteEnd: { action: "note released" },
    className: { control: false },
  },
  parameters: {
    // Each example needs its own window: Piano listens for keyboard events.
    docs: {
      story: { inline: false, height: 420 },
      description: { component: `The piano is Replay's main practice surface. These stories render the production Piano and PianoKey components, with real local audio and no Cloud or MIDI connection.

### Anatomy and sizing
White keys fill the space remaining below the rail; black keys sit above them at 56% height, in groups of two and three. Labels live in the aligned 52 px rail above the keys, including a 2 px gap below the labels. Give the component an explicit parent height (240 px here); it fills that space. The compact layout has 22 white and 15 black keys. The full layout has 52 white and 36 black keys and scrolls inside its frame on an iPad or narrow window.

### Musical identity
C is red, D orange, E yellow, F green, G cyan, A blue and B violet. Rail cells carry pitch identity; sharps use the natural below. Keys carry source identity: lime for the player and blue for playback in Acid. The rail uses the same source color for its bottom bar. Colors come from the same palette as web notation and falling notes.

### State and motion
Local mouse, touch, MIDI and microphone input takes priority over external playback for a shared note. Releasing local input reveals any remaining playback highlight. Both the key and its rail cell update together within 70 ms, with transitions removed for reduced motion. Input-disabled and instrument-range-disabled states are distinct; out-of-range keys and rail cells use muted surfaces.

### Full keyboard labels
The full keyboard preserves the original 1040 px minimum width and scrolls keys and rail together. Its rail omits octaves, with 10 px labels on narrow sharp cells. Key accessible names and tooltips retain the complete localized note and octave.

### Input
Mouse press/release and touch start/end/cancel play and release notes; leaving a key with the mouse releases it. Computer-key shortcuts follow the existing AZERTY mapping: E → C4, R → D4, T → E4, Y → F4, U → G4; 4 → C♯4 and 5 → D♯4. Focus the story canvas before trying shortcuts. Typing in text fields does not play notes. Playback highlights alone are silent.

### Accessibility and use
Keep complete note names and octaves on key accessible names; do not communicate pitch only through color. Disabled keys use native button semantics. These dense layouts are musical surfaces, not 44 px action-button grids: use the full layout's scrolling and a physical MIDI keyboard when appropriate. Computer shortcuts are the current keyboard-playing path; focused Space/Enter activation is not implemented. Check narrow layouts and label legibility before changing key dimensions.`,
      },
    },
  },
} satisfies Meta<typeof Piano>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playable: Story = {};
export const PlaybackChord: Story = {
  args: { activeKeys: new Set(["C4", "E4", "G4"]), allowInput: false },
  parameters: { docs: { description: { story: "A C-major chord supplied by playback. The visual highlight does not trigger audio." } } },
};
export const SharpHighlights: Story = { args: { activeKeys: new Set(["C#4", "F#4", "A#4"]), allowInput: false } };
export const Solfege: Story = { args: { language: "fr", notationPreference: "auto" } };
export const InputDisabled: Story = { args: { allowInput: false } };
export const Full88Keys: Story = { args: { fullKeyboard: true } };

export const PlayerOverPlayback: Story = { args: { activeKeys: new Set(["C4", "E4", "G4"]) }, parameters: { docs: { description: { story: "Hold E or C4 to replace its blue playback highlight with lime; release to reveal blue again." } } } };
