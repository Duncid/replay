import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const probe = readFileSync(new URL("../public/performance-probe.js", import.meta.url), "utf8");
for (const notes of [200, 1000, 5000]) for (const full of [false, true]) {
  test(`${notes} notes ${full ? "full" : "compact"}`, async ({ page }, info) => {
    await page.addInitScript(({ notes, full }) => {
      localStorage.setItem("replay-active-mode", JSON.stringify("play"));
      window["__replayPerformanceConfig"] = { notes, full, seconds: 8 };
      window["__replayPerformanceManualStart"] = true;
    }, { notes, full });
    await page.addInitScript({ content: probe });
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => window["__replayPerformanceResults"]?.some(record => record.phase === "startup"))).toBe(true);
    if (full) await expect(page.locator('#full-keyboard')).toBeChecked();
    await page.getByRole('button', { name: 'Practice: Performance Fixture', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window["__replayPerformanceResults"]?.some(record => ["complete", "error"].includes(record.phase))), { timeout: 65000 }).toBe(true);
    const result = await page.evaluate(() => window["__replayPerformanceResults"]);
    await info.attach("performance.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    expect(result.filter(record => record.phase === "error")).toEqual([]);
    const isolation = await page.evaluate(async () => {
      try { await fetch("https://fixture.invalid/functions/v1/tune-evaluate", { method: "POST" }); return "escaped"; }
      catch (error) { return String(error); }
    });
    expect(isolation).toContain("Unexpected cloud call during probe");
    expect(result.find(record => record.phase === "playback").frames).toBeGreaterThan(0);
    expect(result.find(record => record.phase === "audio-start").sceneToAudioMs).toBeGreaterThanOrEqual(950);
    expect(await page.evaluate(() => localStorage.getItem("replay-active-mode"))).toBe(JSON.stringify("play"));
  });
}
