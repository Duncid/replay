import type { Meta, StoryObj } from "@storybook/react-vite";
import { TuneCarousel } from "@/components/TuneCarousel";
import { tuneCarouselItems } from "./tuneCardFixtures";

const meta = {
  title: "Patterns/Tune carousel",
  component: TuneCarousel,
  args: { tunes: tuneCarouselItems, onSelectTune: () => {} },
  argTypes: { onSelectTune: { action: "tune selected" } },
  parameters: {
    edgeToEdge: true,
    docs: { description: { component: `The production tune-list carousel, also used by Patterns/Tunes screen. It composes TuneCard without duplicating its rendering.

Swipe, use a horizontal trackpad gesture, or focus the list and use arrow keys to scroll. Tab reaches playable cards; Enter/Space selects the original tune key. Locked cards remain visible in the list but cannot be selected. There is no auto-advance or animated JavaScript scrolling.

Cards are 256 px wide below the 640 px viewport breakpoint and 288 px above it, with a 16 px gap. Side padding centers the first and last cards; CSS scroll snapping centers each item. Cards stretch to the tallest item, with 16 px vertical space for focus and glow. The compact example constrains the container; use Storybook's viewport control to exercise the small-screen breakpoint.

Available cards have a restrained neon border at rest and the shared player glow on hover/focus; locked cards keep neutral borders. Pitch previews and surfaces follow the selected theme. Loading, errors and empty-library messaging belong to TuneLibraryView, outside this list.` } },
  },
} satisfies Meta<typeof TuneCarousel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MixedStates: Story = {};
export const Compact: Story = { decorators: [(Story) => <div className="w-full max-w-[390px]"><Story /></div>] };
export const SingleTune: Story = { args: { tunes: tuneCarouselItems.slice(0, 1) } };
export const LongList: Story = { args: { tunes: [
  ...tuneCarouselItems,
  ...["first-steps-with-both-hands", "evening-melody", "quiet-morning", "another-day", "last-dance"].map(tune_key => ({
    tune_key, unlocked: true, prerequisites: [], preview: tuneCarouselItems[0].preview,
  })),
] } };
