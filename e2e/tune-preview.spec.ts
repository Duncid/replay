import { expect, test, accountRows } from "./fixtures";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    previewVoices: { frequency: number; stops: number }[];
  }
}

async function setupPreviews(page: Page) {
  // Exercise actual Web Audio scheduling with the existing offline piano fallback.
  await page.route("**/*.mp3", route => route.abort());
  await page.addInitScript(() => {
    window.previewVoices = [];
    const start = OscillatorNode.prototype.start;
    const stop = OscillatorNode.prototype.stop;
    const voices = new WeakMap<OscillatorNode, { frequency: number; stops: number }>();
    OscillatorNode.prototype.start = function (when) {
      if (this.type === "triangle") {
        const voice = { frequency: this.frequency.value, stops: 0 };
        voices.set(this, voice);
        window.previewVoices.push(voice);
      }
      return start.call(this, when);
    };
    OscillatorNode.prototype.stop = function (when) {
      const voice = voices.get(this);
      if (voice) voice.stops++;
      return stop.call(this, when);
    };
  });
  await page.route("**/rest/v1/**", route => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    const body = table === "tune_assets" ? [
      {
        tune_key: "intro", composer: "First Composer", is_global: true,
        note_sequence: {
          notes: Array.from({ length: 16 }, (_, i) => ({ pitch: 60, startTime: i * 0.1, endTime: i * 0.1 + 0.08 })),
          totalTime: 2,
        },
      },
      {
        tune_key: "second", composer: "Second Composer", is_global: true,
        note_sequence: { notes: [{ pitch: 72, startTime: 0, endTime: 5 }], totalTime: 5 },
      },
      { tune_key: "missing", is_global: true, note_sequence: null },
    ] : table === "curriculum_exports" ? { snapshot: {
      tunes: [{ tuneKey: "intro", musicRef: "intro" }, { tuneKey: "second", musicRef: "second" }],
      edges: [{ source_key: "intro", target_key: "second", edge_type: "tune_next" }],
    } } : [];
    return route.fulfill({ json: accountRows(route.request().url()) ?? body });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Preview: Intro", exact: true })).toBeVisible();
}

test("preview plays every note once and returns to Preview at the end", async ({ page }) => {
  await setupPreviews(page);
  await expect(page.getByRole("button", { name: "Preview: Missing", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preview: Intro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop preview: Intro", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("tune-preview.png") });
  await expect(page.getByRole("heading", { name: "What would you like to play today?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview: Intro", exact: true })).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => window.previewVoices.length)).toBe(16);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.previewVoices.length)).toBe(16);
});

test("switching previews stops the previous voice, and Stop cancels playback", async ({ page }) => {
  await setupPreviews(page);
  await expect(page.getByRole("button", { name: "Locked: Second", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preview: Second", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.previewVoices.length)).toBe(1);
  await page.getByRole("button", { name: "Preview: Intro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview: Second", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.previewVoices[0].stops)).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => window.previewVoices.length)).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Stop preview: Intro", exact: true }).click();
  const count = await page.evaluate(() => window.previewVoices.length);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.previewVoices.length)).toBe(count);
  expect(await page.evaluate(() => window.previewVoices.every(voice => voice.stops > 1))).toBe(true);
  await expect(page.getByRole("button", { name: "Preview: Intro", exact: true })).toBeVisible();
});

test("leaving the tune list stops the preview", async ({ page }) => {
  await setupPreviews(page);
  await page.getByRole("button", { name: "Preview: Second", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.previewVoices.length)).toBe(1);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Quest", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What would you like to play today?" })).not.toBeVisible();
  expect(await page.evaluate(() => window.previewVoices[0].stops)).toBeGreaterThan(1);
});

test("opening a tune for practice stops the preview", async ({ page }) => {
  await setupPreviews(page);
  await page.getByRole("button", { name: "Preview: Second", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.previewVoices.length)).toBe(1);
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  expect(await page.evaluate(() => window.previewVoices[0].stops)).toBeGreaterThan(1);
  await expect(page.getByRole("button", { name: "Stop preview: Second", exact: true })).toHaveCount(0);
});
