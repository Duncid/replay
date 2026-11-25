import { test, expect, accountRows } from "./fixtures";

const expectedLinks: [string, string][] = [
  ["Beginner piano scores", "https://noctavepiano.com/en/sheet-music/#band-easy"],
  ["Additional free library — 882 pieces", "https://noctavepiano.com/en/free-library/"],
  ["Beginner piano, free downloads", "https://musescore.com/sheetmusic/beginner/piano"],
  ["PianoXML collection", "https://musescore.com/user/9292486"],
  ["Example: When the Saints Go Marching In", "https://be.creativeranges.org/library/sheets/when-the-saints-go-marching-in-opensongs"],
];

test("add-a-tune dialog lists the three score sources with their links", async ({ page }) => {
  // The add-a-tune control only shows once the library has at least one tune to sit beside.
  await page.route("**/rest/v1/**", route => route.fulfill({ json: accountRows(route.request().url()) ??
    (route.request().url().includes("/tune_assets") ? [{ tune_key: "intro", is_global: true, note_sequence: { notes: [{ pitch: 60, startTime: 0, endTime: 1 }], totalTime: 1 } }] : []) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Add a tune", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Upload a .mxl file")).toBeVisible();

  for (const [label, href] of expectedLinks) {
    const link = dialog.getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
  }

  // The licence filter advice is what keeps a download usable, so it must be visible too.
  await expect(dialog.getByText("To modify commercially")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Choose a .mxl file", exact: true })).toBeVisible();
});
