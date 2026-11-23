import { expect, test } from "@playwright/test";

const open = async (page: import("@playwright/test").Page) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("iframe.html?id=feedback-practice-feedback-toast--lifecycle&viewMode=story");
  await expect(page.getByRole("status")).toContainText("Bien joué");
  await page.clock.install();
  await page.getByRole("button", { name: "Show feedback again" }).click();
};

test("feedback leaves, repeats identical results, and cancels obsolete exit timers", async ({ page }) => {
  await open(page);
  const toast = page.locator(".practice-feedback-toast");
  await page.clock.runFor(6000);
  await expect(toast).toHaveAttribute("data-state", "leaving");
  await page.getByRole("button", { name: "Show feedback again" }).click();
  await page.clock.runFor(300);
  await expect(toast).toHaveAttribute("data-state", "visible");
  await page.clock.runFor(6500);
  await expect(toast).toBeHidden();
  await page.getByRole("button", { name: "Show feedback again" }).click();
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Dismiss feedback" }).click();
  await page.clock.runFor(250);
  await expect(toast).toBeHidden();
  await page.getByRole("button", { name: "Next section" }).click();
  await expect(toast).toBeVisible();
});

test("pending feedback waits for a result and focused feedback stays readable", async ({ page }) => {
  await open(page);
  const toast = page.locator(".practice-feedback-toast");
  await page.getByRole("button", { name: "Send performance" }).click();
  await page.clock.runFor(20000);
  await expect(page.getByRole("status")).toHaveText("Sending performance…");
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Show feedback again" }).click();
  await page.getByRole("button", { name: "Dismiss feedback" }).focus();
  await page.clock.runFor(20000);
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Show feedback again" }).focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(7000);
  await expect(toast).toBeHidden();
});
