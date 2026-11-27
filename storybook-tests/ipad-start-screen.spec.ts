import { expect, test } from "@playwright/test";

test("start-screen artwork adapts the keyboard and centers the logo above it", async ({ page }) => {
  const counts: number[] = [];
  for (const viewport of [{ width: 1194, height: 834 }, { width: 834, height: 1194 }]) {
    await page.setViewportSize(viewport);
    await page.goto("iframe.html?id=ipad-assets-start-screens--minimal&viewMode=story");
    await expect(page.locator("main")).toHaveAttribute("data-scene-ready", "true");
    const geometry = await page.evaluate(() => {
      const space = document.querySelector(".ipad-start-screen__space")!.getBoundingClientRect();
      const logo = document.querySelector("main h1")!.getBoundingClientRect();
      const keys = [...document.querySelectorAll(".piano-key")];
      return { offsetX: logo.x + logo.width / 2 - (space.x + space.width / 2), offsetY: logo.y + logo.height / 2 - (space.y + space.height / 2),
        fits: logo.top >= space.top && logo.bottom <= space.bottom,
        keysFit: keys.every(key => { const r = key.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }),
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    });
    expect(Math.abs(geometry.offsetX)).toBeLessThan(1);
    expect(Math.abs(geometry.offsetY)).toBeLessThan(1);
    expect(geometry.fits && geometry.keysFit).toBe(true);
    expect(geometry.overflow).toBe(false);
    counts.push(await page.locator(".piano-key:not(.piano-key--black)").count());
    await expect(page.locator('.piano-key[data-note="E4"]')).toHaveAttribute("data-activity", "user");
    await expect(page.locator('.note-rail__cell[data-note="E4"]')).toHaveAttribute("data-activity", "user");
    await expect(page.locator("main")).toHaveAttribute("data-scene-beat", "4.25");
  }
  expect(counts[0]).toBeGreaterThan(counts[1]);
});

test("a controlled beat changes the shared note and key state", async ({ page }) => {
  await page.goto("iframe.html?id=ipad-assets-start-screens--minimal&viewMode=story&args=beat:5.75");
  await expect(page.locator("main")).toHaveAttribute("data-scene-ready", "true");
  await expect(page.locator("main")).toHaveAttribute("data-scene-beat", "5.75");
  await expect(page.locator('.piano-key[data-note="G4"]')).toHaveAttribute("data-activity", "user");
  await expect(page.locator('.note-rail__cell[data-note="G4"]')).toHaveAttribute("data-activity", "user");
  await expect(page.locator('.piano-key[data-note="E4"]')).not.toHaveAttribute("data-activity");
});
