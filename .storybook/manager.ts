import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

addons.setConfig({
  theme: create({ base: "dark", appBg: "#000", appContentBg: "#000", appPreviewBg: "#000", barBg: "#000", brandTitle: "Noodlyn · Design system", colorPrimary: "#c6ff1a", colorSecondary: "#c6ff1a" }),
});
