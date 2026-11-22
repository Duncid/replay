import type { Preview } from "@storybook/react-vite";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/index.css";

const preview: Preview = {
  tags: ["autodocs"],
  decorators: [(Story) => <TooltipProvider><div className="p-6 text-foreground"><Story /></div></TooltipProvider>],
  parameters: {
    layout: "fullscreen",
    backgrounds: { options: { replay: { name: "Replay", value: "hsl(220 20% 8%)" } } },
    controls: { expanded: true },
    options: { storySort: { order: ["Foundations", "Actions", "Inputs", "Navigation", "Overlays", "Feedback", "Patterns"] } },
  },
  initialGlobals: { backgrounds: { value: "replay" } },
};
export default preview;
