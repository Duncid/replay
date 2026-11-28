import { expect, test, accountRows } from "./fixtures";

test("highway covers the top UI while controls, dock alignment remain usable with or without rail notes", async ({ page }) => {
  const sequence = { notes: Array.from({ length: 120 }, (_, i) => ({ pitch: 48 + i % 25, startTime: i * .25, endTime: i * .25 + .2, velocity: 90 })), totalTime: 30 };
  await page.addInitScript(() => localStorage.setItem("replay-instrument", JSON.stringify("classic")));
  await page.route("**/rest/v1/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(
    accountRows(route.request().url()) ?? (route.request().url().includes("tune_assets") ? [{ tune_key: "intro", is_global: true, briefing: null }] : []),
  ) }));
  await page.route("**/functions/v1/tune-coach", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    tuneTitle: "Intro", practicePlan: [{ itemId: "background", itemType: "nugget", instruction: "Follow the notes through the highway.", nugget: { noteSequence: sequence } }],
  }) }));
  await page.goto("/");
  const workspaceColor = await page.locator("[data-highway-surface]").evaluate(el => getComputedStyle(el).backgroundColor);
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  const highway = page.locator('.note-highway[data-render-ready="true"]');
  await expect(highway).toBeVisible();
  const alignment = async () => page.evaluate(() => {
    const canvas = document.querySelector(".note-highway")!.getBoundingClientRect();
    const dock = document.querySelector(".piano-dock")!;
    const occlusion = parseFloat(getComputedStyle(dock).getPropertyValue("--dock-occlusion"));
    const rail = document.querySelector(".note-rail");
    const target = rail ? rail.getBoundingClientRect().bottom : document.querySelector(".piano-surface")!.getBoundingClientRect().top;
    return {
      top: Math.abs(canvas.top - document.querySelector("[data-highway-surface]")!.getBoundingClientRect().top),
      hit: Math.abs(canvas.bottom - occlusion - dock.getBoundingClientRect().top),
      rail: Math.abs(canvas.bottom - target),
    };
  });
  await expect.poll(alignment).toEqual({ top: 0, hit: 0, rail: 0 });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("menu").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(highway).toBeVisible();
  await expect.poll(alignment).toEqual({ top: 0, hit: 0, rail: 0 });
  await page.getByRole("button", { name: "Keyboard settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Display Notes", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Never", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".note-rail")).toHaveCount(0);
  await expect.poll(alignment).toEqual({ top: 0, hit: 0, rail: 0 });
  await page.getByRole("button", { name: "Keyboard settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Display Notes", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Auto", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".note-rail")).toBeVisible();
  await expect.poll(alignment).toEqual({ top: 0, hit: 0, rail: 0 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What would you like to play today?" })).toBeVisible();
  await expect(page.locator(".note-highway")).toHaveCount(0);
  expect(await page.locator("[data-highway-surface]").evaluate(el => getComputedStyle(el).backgroundColor)).toBe(workspaceColor);
});
