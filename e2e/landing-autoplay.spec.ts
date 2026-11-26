import { expect, test } from "@playwright/test";
import { demoWav } from "./fixtures/demoAudio";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])] } });
test.skip(({ browserName }) => browserName !== "chromium", "Chromium autoplay permission; WebKit gesture fallback is covered in landing-live.");
test("permitted autoplay starts real acoustic audio without a click", async ({ page }) => {
  await page.route("**/*.supabase.co/**", route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      return resume.call(this).then(() => { window["demoAudioRunning"] = this.state === "running"; });
    };
  });
  await page.route("**/tonejs-instruments/samples/**", route => route.fulfill({ body: demoWav(), contentType: "audio/wav" }));
  await page.goto("/");
  await expect(page.locator(".landing-live-preview")).toHaveAttribute("data-sound", "acoustic-piano", { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window["demoAudioRunning"])).toBe(true);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".landing-live-preview")).toHaveAttribute("data-playing", "false");
  await expect(page.locator(".landing-live-preview")).toHaveAttribute("data-sound", "silent");
});
