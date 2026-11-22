import type { Meta, StoryObj } from "@storybook/react-vite";
import { PianoKey } from "@/components/PianoKey";

const meta = {
  title: "Instruments/Piano key",
  component: PianoKey,
  args: {
    note: "C4", isBlack: false, activity: undefined, isPlayable: true,
    onPress: () => {}, onRelease: () => {},
  },
  argTypes: { onPress: { action: "pressed" }, onRelease: { action: "released" } },
  decorators: [(Story) => <div className="grid h-60 w-24"><Story /></div>],
  parameters: { docs: { description: { component: "The production key primitive, shown at a larger inspection size. Toggle controls to compare player, playback and range-disabled styling. These isolated keys are visual fixtures: use Piano keyboard / Playable for sound and live press/release state. Labels have moved to Note rail. Complete note names remain on the key buttons for screen readers." } } },
} satisfies Meta<typeof PianoKey>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WhiteIdle: Story = {};
export const WhitePlayer: Story = { args: { activity: "user" } };
export const WhitePlayback: Story = { args: { activity: "ai" } };
export const SharpIdle: Story = { args: { note: "C#4", isBlack: true } };
export const SharpPlayback: Story = { args: { note: "C#4", isBlack: true, activity: "ai" } };
export const OutsideInstrumentRange: Story = {
  args: { isPlayable: false, disabled: true },
  parameters: { docs: { description: { story: "Unavailable in the selected instrument's sample range. The full piano computes this from INSTRUMENT_NOTE_RANGES." } } },
};
export const SharpOutsideInstrumentRange: Story = { args: { note: "C#4", isBlack: true, isPlayable: false, disabled: true } };
