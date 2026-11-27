import { expect, test } from "@playwright/test";

test("catalog normalizes directory URLs without losing the selected story", async ({ page }) => {
  // Match hosting that serves the manager HTML without a directory redirect.
  await page.route(/\/storybook\?/, async route => {
    const response = await page.request.get("/storybook/index.html");
    await route.fulfill({ response });
  });
  await page.goto("/storybook?path=/story/foundations-noodlyn--overview#catalog");
  await expect(page).toHaveURL(/\/storybook\/\?path=\/story\/foundations-noodlyn--overview#catalog$/);
  await expect(page.frameLocator("#storybook-preview-iframe").getByRole("heading", { name: "Made for practice." })).toBeVisible();
});

test("catalog uses the app theme and musical colors", async ({ page }) => {
  await page.goto("iframe.html?id=foundations-noodlyn--overview&viewMode=story");
  await expect(page.getByRole("heading", { name: "Made for practice." })).toBeVisible();
  expect(await page.locator("body").evaluate(el => getComputedStyle(el).getPropertyValue("--primary").trim().split(/\s+/).map(parseFloat))).toEqual([74.934, 100, 55.098]);
  expect(await page.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("locked tune cannot be selected", async ({ page }) => {
  await page.goto("iframe.html?id=patterns-tune-card--locked&viewMode=story");
  await expect(page.getByRole("button", { name: "Locked: St Louis Blues" })).toBeDisabled();
  await expect(page.getByText("Complete Intro")).toBeVisible();
});

test("settings controls expose labels and support keyboard input", async ({ page }) => {
  await page.goto("iframe.html?id=inputs-controls--settings&viewMode=story");
  const toggle = page.getByRole("switch", { name: "Silent while I play" });
  await toggle.click();
  await expect(toggle).toBeChecked();
  const tempo = page.getByRole("slider", { name: /Tempo/ });
  await tempo.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tempo).toHaveAttribute("aria-valuenow", "91");
});

test("dialog supports keyboard dismissal and returns focus", async ({ page }) => {
  await page.goto("iframe.html?id=overlays-surfaces--modal&viewMode=story");
  const trigger = page.getByRole("button", { name: "Open practice details" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Practice details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("legacy notifications and tune notifications use one renderer", async ({ page }) => {
  await page.goto("iframe.html?id=feedback-feedback--notifications&viewMode=story");
  await page.getByRole("button", { name: "Show error" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Unable to save" })).toBeVisible();
  await page.getByRole("button", { name: "Show success" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Tune completed" })).toBeVisible();
  await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
});
