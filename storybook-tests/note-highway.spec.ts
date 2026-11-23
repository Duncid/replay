import { expect, test } from "@playwright/test";
import { highwayState, nextHighwayNotes, type HighwayNote } from "../src/components/highway/model";

// Software WebGL on headless Chromium can need extra time for its first shader compilation.
test.setTimeout(60000);

test("waiting chords remain armed, while unjudged notes never sound automatically", () => {
  const notes: HighwayNote[] = [60,64,67].map(midi => ({ id: String(midi), midi, start: 4, duration: 2, who: "user" }));
  notes.push({ id: "bot", midi: 48, start: 4, duration: 2, who: "ai" });
  expect(nextHighwayNotes(notes, 4, true).map(n => n.midi)).toEqual([60,64,67]);
  expect(highwayState(notes[0], 4.1, false)).toBe("upcoming");
  expect(highwayState(notes[0], 4, true)).toBe("next");
  expect(highwayState(notes[0], 4.1, false, true)).toBe("sounding");
  expect(highwayState(notes[3], 4.1, false)).toBe("sounding");
  expect(highwayState({ ...notes[0], judgment: "miss" }, 4.1, false)).toBe("miss");
  expect(highwayState({ ...notes[0], judgment: "perfect" }, 6, false)).not.toBe("sounding");
});

for (const story of ["perfect-and-bot", "miss-and-next", "waiting-for-chord", "full-keyboard"]) {
  test(`${story}: production canvas, guidance and pixel alignment`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`iframe.html?id=instruments-note-highway--${story}&viewMode=story`);
    await expect(page.locator(".note-highway canvas")).toBeVisible({ timeout: 30000 });
    const expected = story === "waiting-for-chord" ? ["E4", "G4"] : story === "miss-and-next" ? ["G4"] : ["E4"];
    await expect.poll(async () => (await page.locator('.note-rail__cell[data-armed="true"]').evaluateAll(cells => cells.map(c => c.getAttribute("data-note")))).sort(), { timeout: 30000 }).toEqual(expected);
    for (const width of [600, 1024, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      const drift = await page.locator(".piano-key").evaluateAll(keys => Math.max(...keys.map(key => {
        const cell = document.querySelector(`.note-rail__cell[data-note="${key.getAttribute("data-note")}"]`)!;
        const a = key.getBoundingClientRect(), b = cell.getBoundingClientRect();
        return Math.max(Math.abs(a.x-b.x), Math.abs(a.width-b.width));
      })));
      expect(drift).toBeLessThan(1);
      // The canvas must actually extend beneath both bars, not stop at their edge.
      await expect.poll(async () => page.locator(".piano-dock").evaluate(dock => {
        const toolbar = dock.querySelector(".keyboard-toolbar")!.getBoundingClientRect();
        const rail = dock.querySelector(".note-rail")!.getBoundingClientRect();
        const backdrop = dock.querySelector(".piano-dock__backdrop")!.getBoundingClientRect();
        const canvas = document.querySelector(".note-highway canvas")!.getBoundingClientRect();
        return Math.max(Math.abs(rail.top - toolbar.bottom - 8), Math.abs(canvas.bottom - rail.bottom), Math.abs(backdrop.bottom - rail.bottom));
      })).toBeLessThan(1);
      await expect(page.locator(".piano-key").first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    await expect(page.getByRole("button", { name: "C6", exact: true })).toBeEnabled();
    if (story === "full-keyboard") {
      await page.getByRole("button", { name: "C8", exact: true }).scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('.note-highway-viewport').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    if (story === "miss-and-next") await expect(page.locator('.piano-key[data-note="A4"]')).not.toHaveAttribute("data-activity");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".note-highway canvas")).toHaveAttribute("aria-hidden", "true");
    expect(errors).toEqual([]);
  });
}

test("production practice waits for the required pitch and advances after input", async ({ page }) => {
  await page.goto("iframe.html?id=instruments-note-highway--gated-practice&viewMode=story");
  const c = page.locator('.note-rail__cell[data-note="C4"]');
  await expect(c).toHaveAttribute("data-armed", "true", { timeout: 30000 });
  await page.keyboard.press("r"); // Wrong D4 cannot satisfy the C4 gate.
  await expect(c).toHaveAttribute("data-armed", "true");
  await page.keyboard.press("e");
  await expect(page.locator('.note-rail__cell[data-note="D4"]')).toHaveAttribute("data-armed", "true");
  await expect(c).toHaveAttribute("data-armed", "false");
});
