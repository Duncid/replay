import type { Meta, StoryObj } from "@storybook/react-vite";
import { TuneCard } from "@/components/TuneCard";
const meta = { title: "Patterns/Tune card", component: TuneCard, args: { title: "Intro", unlocked: true, onSelect: () => {} }, argTypes: { onSelect: { action: "selected" } }, decorators: [(Story) => <div className="max-w-md"><Story /></div>] } satisfies Meta<typeof TuneCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unlocked: Story = {};
export const Locked: Story = { args: { title: "St Louis Blues", unlocked: false, prerequisites: ["Intro"] } };
export const LongTitle: Story = { args: { title: "A longer tune title that wraps comfortably on a smaller screen", unlocked: false, prerequisites: ["Intro", "First steps with both hands"] } };
