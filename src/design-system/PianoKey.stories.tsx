import type { Meta, StoryObj } from "@storybook/react-vite";
import { PianoKey } from "@/components/PianoKey";

const meta = {
  title: "Instruments/Piano key",
  component: PianoKey,
  args: {
    note: "C4", frequency: 261.63, isBlack: false, isActive: false,
    isSustained: false, isPlayable: true, hasColor: true,
    onPress: () => {}, onRelease: () => {},
  },
  argTypes: { onPress: { action: "pressed" }, onRelease: { action: "released" } },
  decorators: [(Story) => <div className="grid h-60 w-24"><Story /></div>],
  parameters: { docs: { description: { component: "The production key primitive, shown at a larger inspection size. Toggle controls to compare attack, sustain and range-disabled styling. These isolated keys are visual fixtures: use Piano keyboard / Playable for sound and live press/release state. Natural-note labels use solid pitch colors; sharps use a striped pair of neighboring colors." } } },
} satisfies Meta<typeof PianoKey>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WhiteIdle: Story = {};
export const WhiteAttack: Story = { args: { isActive: true } };
export const WhiteSustained: Story = { args: { isActive: true, isSustained: true } };
export const SharpIdle: Story = { args: { note: "C#4", frequency: 277.18, isBlack: true } };
export const SharpSustained: Story = { args: { note: "C#4", frequency: 277.18, isBlack: true, isActive: true, isSustained: true } };
export const OutsideInstrumentRange: Story = {
  args: { isPlayable: false, disabled: true },
  parameters: { docs: { description: { story: "Unavailable in the selected instrument's sample range. The full piano computes this from INSTRUMENT_NOTE_RANGES." } } },
};
export const SharpOutsideInstrumentRange: Story = { args: { note: "C#4", frequency: 277.18, isBlack: true, isPlayable: false, disabled: true } };
