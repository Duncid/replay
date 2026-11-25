import type { Meta, StoryObj } from "@storybook/react-vite";
import { TuneCard } from "@/components/TuneCard";
import { tuneCardPreview } from "./tuneCardFixtures";

const meta = {
  title: "Patterns/Tune card",
  component: TuneCard,
  args: { title: "Intro", composer: "Replay", unlocked: true, preview: tuneCardPreview, onSelect: () => {}, onPreview: () => {} },
  argTypes: { onSelect: { action: "selected" } },
  parameters: { docs: { description: { component: "Matches Replay Nat: a 120 px horizontal note-highway illustration, 22 px corners, 20 px content padding, status, title and duration. The static SVG displays up to 14 actual notes using shared pitch tokens: 12 px tall blocks with 3 px corners on a plain card background, without lane lines. Time runs left to right, pitch runs bottom to top, and note length reflects duration. It needs no audio or animation loop. Locked previews dim while text remains legible. Acquired tunes use the same Ready to play label and arrow as other playable tunes; no acquisition badge or check icon is shown. Missing sequences show a music icon and omit metadata. Library cards are 256–288 px wide and stretch to the tallest item; titles wrap without truncation. Available and acquired cards have a 1 px primary border at 50% opacity, visible on touch screens. Hover and keyboard focus restore the full neon border and shared player glow. Locked cards keep a neutral border and no glow. All colors follow the selected app palette. See Patterns/Tune carousel for scrolling, sizing and selection behavior." } } },
  decorators: [(Story) => <div className="w-full max-w-72"><Story /></div>],
} satisfies Meta<typeof TuneCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unlocked: Story = {};
export const Locked: Story = { args: { title: "St Louis Blues", unlocked: false, prerequisites: ["Intro"] } };
export const NoPreview: Story = { args: { preview: undefined, onPreview: undefined } };
export const PlayingPreview: Story = { args: { isPreviewPlaying: true } };
export const LongTitle: Story = { args: { title: "A longer tune title that wraps comfortably on a smaller screen", unlocked: false, prerequisites: ["Intro", "First steps with both hands"] } };
