import type { Page } from "@playwright/test";
import { expect, test, accountRows } from "./fixtures";

async function displayNotes(page: Page, value: "Auto" | "Always" | "Never") {
  await page.getByRole("button", { name: "Keyboard settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Display Notes", exact: true }).click();
  await page.getByRole("menuitemradio", { name: value, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("keyboard settings remember instruments and note visibility across library, practice and composer", async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ json:
    accountRows(route.request().url()) ?? (route.request().url().includes("tune_assets") ? [{ tune_key: "intro", is_global: true, briefing: null }] : []),
  }));
  await page.route("**/functions/v1/tune-coach", route => route.fulfill({ json: {
    tuneTitle: "Intro", practicePlan: [{ itemId: "settings", itemType: "nugget", instruction: "Follow the notes.",
      nugget: { noteSequence: { notes: [{ pitch: 60, startTime: 0, endTime: 1, velocity: 90 }], totalTime: 1 } } }],
  } }));
  await page.goto("/");
  const rail = page.locator(".note-rail");
  const key = page.locator('.piano-key[data-note="C4"]');
  await expect(key).toBeVisible();
  await expect(rail).toHaveCount(0);
  const keyHeight = await key.evaluate(el => el.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Keyboard settings", exact: true }).click();
  await expect(page.getByRole("menuitemradio").first()).toHaveText("Acoustic Piano");
  await expect(page.getByRole("menuitemradio", { name: "Acoustic Piano", exact: true })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Patch", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await displayNotes(page, "Always");
  await expect(rail).toBeVisible();
  expect(await key.evaluate(el => el.getBoundingClientRect().height)).toBe(keyHeight);
  await page.reload();
  await expect(rail).toBeVisible();
  await page.getByRole("button", { name: "Keyboard settings", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Patch", exact: true })).toBeChecked();
  await page.getByRole("menuitem", { name: "Display Notes", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Always", exact: true })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Always", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await displayNotes(page, "Never");
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeVisible();
  await expect(rail).toHaveCount(0);
  await displayNotes(page, "Auto");
  await expect(rail).toBeVisible();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeVisible();
  await expect(rail).toHaveCount(0);
  await page.getByRole("tab", { name: "Compose", exact: true }).click();
  await expect(rail).toHaveCount(0);
  await displayNotes(page, "Always");
  await expect(rail).toBeVisible();
});
