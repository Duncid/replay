import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
});

test("switching branches closes the abandoned submenu", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Tune Management", exact: true }).hover();
  await expect(page.getByRole("menuitem", { name: "Published", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Language", exact: true }).hover();
  await expect(page.getByRole("menuitem", { name: "English", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Published", exact: true })).not.toBeVisible();
});

test("nested traversal stays open and leaving closes descendants", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Language", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Music notation", exact: true }).hover();
  const choice = page.getByRole("menuitemradio").filter({ hasText: "Auto" });
  await choice.hover();
  await page.waitForTimeout(400);
  await expect(choice).toBeVisible();
  await page.getByRole("menuitem", { name: "English", exact: true }).hover();
  await expect(choice).not.toBeVisible();
  await expect(page.getByRole("menuitem", { name: "English", exact: true })).toBeVisible();
  // Stay inside the iPad viewport so WebKit dispatches document pointermove.
  await page.mouse.move(page.viewportSize()!.width - 20, 500);
  await expect(page.getByRole("menuitem", { name: "English", exact: true })).not.toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Language", exact: true })).toBeVisible();
});

test("keyboard can still enter and exit submenus", async ({ page }) => {
  const tuneManagement = page.getByRole("menuitem", { name: "Tune Management", exact: true });
  await tuneManagement.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitem", { name: "Published", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("menuitem", { name: "Published", exact: true })).not.toBeVisible();
  await expect(tuneManagement).toBeFocused();
});