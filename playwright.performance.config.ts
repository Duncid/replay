import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./performance-tests",
  outputDir: "./performance-results",
  workers: 1,
  timeout: 90_000,
  use: { baseURL: "http://127.0.0.1:8083" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 8083",
    url: "http://127.0.0.1:8083", reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1194, height: 834 },
      launchOptions: process.platform === "darwin" ? { args: ["--use-angle=metal"] } : undefined } },
    { name: "ipad-webkit", use: { ...devices["iPad Pro 11"], viewport: { width: 1194, height: 834 } } },
  ],
});
