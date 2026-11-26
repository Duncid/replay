import type { Meta, StoryObj } from "@storybook/react-vite";
import { PianoKey } from "@/components/PianoKey";
import { createPianoLayout, pianoKeyStyle } from "@/components/pianoLayout";

const layout = createPianoLayout(false);
const noop = () => {};

function StartScreen() {
  return <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
    <h1 className="absolute inset-0 m-0 grid place-items-center font-display text-[80px] font-semibold tracking-tight">Noodlyn</h1>
    <div aria-hidden="true" inert className="pointer-events-none absolute inset-x-1 bottom-1 h-[266px]">
      <div className="absolute inset-0 z-0">
        {layout.whiteKeys.map(note => <PianoKey key={note.midi} note={`${note.note}${note.octave}`} isBlack={false} isPlayable onPress={noop} onRelease={noop} style={pianoKeyStyle(layout, note)} />)}
      </div>
      <div className="absolute inset-0 z-10">
        {layout.blackKeys.map(note => <PianoKey key={note.midi} note={`${note.note}${note.octave}`} isBlack isPlayable onPress={noop} onRelease={noop} style={pianoKeyStyle(layout, note)} />)}
      </div>
    </div>
  </main>;
}

const meta = {
  title: "Patterns/iPad start screen",
  component: StartScreen,
  parameters: {
    edgeToEdge: true,
    docs: { description: { component: "Source artwork for the adaptive launch screens in Noodlyn and Noodlyn Learn. Regenerate the size pack with scripts/export-ipad-assets.mjs. Noodlyn uses the app's Space Grotesk display font at 80px, centered on the screen. The keys are the production PianoKey components and C3–C6 geometry, with the original white/black surfaces, proportions, shadows and corners. No rail, key highlights or controls. Export in landscape or portrait without changing the design." } },
  },
} satisfies Meta<typeof StartScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Minimal: Story = {};

