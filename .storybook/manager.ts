import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

addons.setConfig({
  theme: create({ base: "dark", brandTitle: "Replay · Design system", colorPrimary: "#facc38", colorSecondary: "#facc38" }),
});
