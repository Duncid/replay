import type { Preview } from "@storybook/react-vite";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/index.css";
import "../src/lib/i18n";
import { themes } from "storybook/theming";

const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: { theme: { description: "Noodlyn palette", toolbar: { icon: "paintbrush", items: ["acid", "amber", "hotwire"], dynamicTitle: true } } },
  decorators: [(Story, context) => {
    const theme = context.globals.theme ?? "acid";
    document.documentElement.dataset.theme = theme;
    return <TooltipProvider key={theme}><div className={context.parameters.edgeToEdge ? "text-foreground" : "p-6 text-foreground"}><Story /></div></TooltipProvider>;
  }],
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    docs: { theme: { ...themes.dark, appBg: "#000", appContentBg: "#000", appPreviewBg: "#000", barBg: "#000" } },
    controls: { expanded: true },
    options: { storySort: { order: ["Foundations", "Instruments", "Actions", "Inputs", "Navigation", "Overlays", "Feedback", "Components", "Patterns"] } },
  },
  initialGlobals: { theme: "acid" },
};
export default preview;
