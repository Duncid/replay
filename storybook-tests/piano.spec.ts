import { expect, test } from "@playwright/test";

test("piano plays and releases pointer and computer-key input", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/iframe.html?id=instruments-piano-keyboard--playable&viewMode=story");
  const c4 = page.getByRole("button", { name: "C4", exact: true });
  await expect(c4).toBeEnabled();
  if (browserName === "webkit") {
    await c4.tap();
  } else {
    // Press below the overlapping black keys.
    await c4.hover({ position: { x: 8, y: 180 } });
    await page.mouse.down();
    await expect(page.getByRole("status")).toContainText("Holding: C4");
    await page.mouse.up();
  }
  await expect(page.getByRole("status")).toContainText("Released C4");
  await expect(page.getByRole("status")).toContainText("No keys held");
  await page.keyboard.down("e");
  await expect(page.getByRole("status")).toContainText("Holding: C4");
  await expect(c4).toHaveClass(/bg-red-400/);
  await page.keyboard.up("e");
  await expect(page.getByRole("status")).toContainText("No keys held");
  await expect(c4).toHaveClass(/bg-key-white/);
  expect(errors).toEqual([]);
});

test("full piano has 88 keys and scrolls within its frame", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 900 });
  await page.goto("/iframe.html?id=instruments-piano-keyboard--full-88-keys&viewMode=story");
  const keyboard = page.getByRole("region", { name: "Piano keyboard example" });
  await expect(keyboard.getByRole("button")).toHaveCount(88);
  await expect(keyboard.getByRole("button", { name: "A0", exact: true })).toBeVisible();
  const lastKey = keyboard.getByRole("button", { name: "C8", exact: true });
  await lastKey.scrollIntoViewIfNeeded();
  await expect(lastKey).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("piano documents solfege labels and disabled playback highlights", async ({ page }) => {
  await page.goto("/iframe.html?id=instruments-piano-keyboard--solfege&viewMode=story");
  await expect(page.getByRole("button", { name: "Do4", exact: true })).toBeEnabled();
  await page.goto("/iframe.html?id=instruments-piano-keyboard--playback-chord&viewMode=story");
  for (const note of ["C4", "E4", "G4"]) {
    await expect(page.getByRole("button", { name: note, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "C4", exact: true })).toHaveClass(/bg-red-400/);
  await page.keyboard.press("e");
  await expect(page.getByRole("status")).toContainText("No notes played yet");
});
