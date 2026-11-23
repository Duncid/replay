import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./storybook-tests",
  outputDir: "./storybook-test-results",
  workers: 2,
  use: { baseURL: "http://127.0.0.1:6007/storybook/" },
  webServer: {
    command: "npm run preview -- --outDir storybook-static --host 127.0.0.1 --port 6007 --base /storybook/",
    url: "http://127.0.0.1:6007/storybook/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // Exercise the native graphics backend on macOS; software WebGL has intermittent cold-start stalls.
    { name: "chromium", use: { ...devices["Desktop Chrome"],
      launchOptions: process.platform === "darwin" ? { args: ["--use-angle=metal"] } : undefined } },
    { name: "ipad-webkit", use: { ...devices["iPad Pro 11"], browserName: "webkit" } },
  ],
});
