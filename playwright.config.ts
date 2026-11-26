import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [{
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 8080 --strictPort",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  }, {
    // Utility/asset tests import source modules; production preview only serves dist.
    command: "npm run dev -- --host 127.0.0.1 --port 8081 --strictPort",
    url: "http://127.0.0.1:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  }],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "ipad-webkit", use: { ...devices["iPad Pro 11"], browserName: "webkit" } },
  ],
});
