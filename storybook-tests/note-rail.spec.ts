import { expect, test } from "@playwright/test";

for (const full of [false, true]) {
  test(`rail tracks every key across resize and scroll (${full ? "88" : "37"} keys)`, async ({ page }) => {
    await page.goto(`iframe.html?id=instruments-piano-keyboard--${full ? "full-88-keys" : "playable"}&viewMode=story`);
    await expect(page.locator(".piano-key")).toHaveCount(full ? 88 : 37);
    for (const width of [768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      if (full) await page.getByRole("button", { name: "C8", exact: true }).scrollIntoViewIfNeeded();
      const drift = await page.locator(".piano-key").evaluateAll(keys => Math.max(...keys.map(key => {
        const cell = document.querySelector(`.note-rail__cell[data-note="${key.getAttribute("data-note")}"]`)!;
        const a = key.getBoundingClientRect(), b = cell.getBoundingClientRect();
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width));
      })));
      expect(drift).toBeLessThan(1);
      await expect(page.locator(".note-rail")).toHaveAttribute("aria-hidden", "true");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test("player and playback stay synchronized, including overlapping notes", async ({ page }) => {
  await page.goto("iframe.html?id=instruments-piano-keyboard--player-over-playback&viewMode=story");
  const key = page.getByRole("button", { name: "C4", exact: true });
  const rail = page.locator('.note-rail__cell[data-note="C4"]');
  await expect(key).toHaveAttribute("data-activity", "ai");
  await expect(rail).toHaveAttribute("data-activity", "ai");
  // Activate the story document before sending a hardware-keyboard shortcut.
  await page.getByRole("heading", { name: "Practice keyboard · C3–C6" }).click();
  await page.keyboard.down("e");
  await expect(key).toHaveAttribute("data-activity", "user");
  await expect(rail).toHaveAttribute("data-activity", "user");
  await page.keyboard.up("e");
  await expect(key).toHaveAttribute("data-activity", "ai");
  await expect(rail).toHaveAttribute("data-activity", "ai");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(key).toHaveCSS("transition-duration", "0s");
  await expect(rail).toHaveCSS("transition-duration", "0s");
});

test("changing keyboard range releases held audio and highlights", async ({ page }) => {
  await page.addInitScript(() => {
    window["pianoVoices"] = 0;
    const start = OscillatorNode.prototype.start, stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function (...args) {
      if (this.type === "triangle") window["pianoVoices"]++;
      return start.apply(this, args);
    };
    OscillatorNode.prototype.stop = function (...args) {
      if (this.type === "triangle") window["pianoVoices"]--;
      return stop.apply(this, args);
    };
  });
  await page.goto("iframe.html?id=instruments-piano-keyboard--range-change&viewMode=story");
  const key = page.getByRole("button", { name: "C4", exact: true });
  await expect(key).toBeEnabled();
  // Focus the rendered story before sending a hardware-keyboard shortcut.
  await page.getByRole("heading", { name: "Practice keyboard · C3–C6" }).click();
  await page.keyboard.down("e");
  await expect(key).toHaveAttribute("data-activity", "user");
  await expect.poll(() => page.evaluate(() => window["pianoVoices"])).toBe(1);
  await page.getByRole("button", { name: "Change range" }).click();
  await expect(page.locator(".piano-key")).toHaveCount(88);
  await expect(key).not.toHaveAttribute("data-activity");
  await expect.poll(() => page.evaluate(() => window["pianoVoices"])).toBe(0);
  await page.keyboard.up("e");
});

for (const theme of ["acid", "amber", "hotwire"]) {
  test(`${theme} rail labels meet contrast and use local fonts`, async ({ page }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.goto(`iframe.html?id=instruments-piano-keyboard--playable&viewMode=story&globals=theme:${theme}`);
    await expect(page.locator(".note-rail__cell")).toHaveCount(37);
    const result = await page.evaluate(async () => {
      await document.fonts.ready;
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const luminance = (color: string) => {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).reduce((sum, value, i) => {
          const v = value / 255;
          return sum + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        }, 0);
      };
      const ratios = [...document.querySelectorAll(".note-rail__cell")].map(cell => {
        const style = getComputedStyle(cell);
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => a - b);
        return (values[1] + 0.05) / (values[0] + 0.05);
      });
      return { minContrast: Math.min(...ratios), theme: document.documentElement.dataset.theme,
        fonts: [document.fonts.check('600 11px "JetBrains Mono"'), document.fonts.check('600 20px "Space Grotesk"'), document.fonts.check('400 15px "Inter"')] };
    });
    expect(result.theme).toBe(theme);
    expect(result.minContrast).toBeGreaterThanOrEqual(4.5);
    expect(result.fonts).toEqual([true, true, true]);
  });
}
