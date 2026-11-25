import { test, expect, accountRows } from "./fixtures";

const expectedSources: [string, string][] = [
  ["Noctave", "https://noctavepiano.com/en/"],
  ["MuseScore", "https://musescore.com/"],
  ["OpenSongs", "https://be.creativeranges.org/library/sheets"],
];

test("add-a-tune dialog lists the three score sources as icon, name and description", async ({ page }) => {
  // The add-a-tune control only shows once the library has at least one tune to sit beside.
  await page.route("**/rest/v1/**", route => route.fulfill({ json: accountRows(route.request().url()) ??
    (route.request().url().includes("/tune_assets") ? [{ tune_key: "intro", is_global: true, note_sequence: { notes: [{ pitch: 60, startTime: 0, endTime: 1 }], totalTime: 1 } }] : []) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Add a tune", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Upload a .mxl file")).toBeVisible();

  for (const [name, href] of expectedSources) {
    // The card's accessible name is its whole text (name + description), so match on the address.
    const card = dialog.getByRole("link", { name: new RegExp(`^${name}`) });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", href);
    // Each card carries its own description, so the name alone is not the whole label.
    await expect(card.getByText(name, { exact: true })).toBeVisible();
    await expect(card.getByText(/Best for|Interesting for/)).toBeVisible();
  }

  // The licence filter advice is what keeps a download usable, so it must stay visible.
  await expect(dialog.getByText("To modify commercially")).toBeVisible();

  // The per-source link buttons were dropped: only the three cards remain.
  await expect(dialog.getByRole("link", { name: "PianoXML collection" })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Beginner piano scores" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Choose a .mxl file", exact: true })).toBeVisible();
});
