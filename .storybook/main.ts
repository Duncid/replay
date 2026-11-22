import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/design-system/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
  // Static builds are served from /storybook on the published app URL.
  viteFinal: (viteConfig, { configType }) => {
    if (configType === "PRODUCTION") {
      viteConfig.base = "/storybook/";
    }
    return viteConfig;
  },
};
export default config;
