import { expect, test, accountRows } from "./fixtures";
import { createAdaptivePianoLayout, pianoKeyGeometry, pianoLayoutKey, pianoBreakGeometry, pianoBreaks } from "../src/components/pianoLayout";

const span = (low: number, high: number) => Array.from({ length: high - low + 1 }, (_, i) => low + i);

test("adaptive ranges keep the default, shift, expand, split or scroll without losing pitches", () => {
  expect(createAdaptivePianoLayout([]).ranges).toEqual([[48, 84]]);
  expect(createAdaptivePianoLayout([52, 81]).ranges).toEqual([[48, 84]]);
  expect(createAdaptivePianoLayout([64, 95]).ranges).toEqual([[60, 96]]);
  expect(createAdaptivePianoLayout(span(36, 83)).ranges).toEqual([[36, 84]]);
  const split = createAdaptivePianoLayout([...span(36, 47), ...span(84, 95)]);
  expect(split.ranges).toHaveLength(2);
  expect(split.whiteKeys.length).toBeGreaterThanOrEqual(22);
  expect(split.widthScale).toBe(1);
  expect(createAdaptivePianoLayout(span(21, 108)).widthScale).toBeGreaterThan(1);
  // A single rare/outlying note is required too; malformed values are ignored.
  const outlier = createAdaptivePianoLayout([60, 60, 60, 108, NaN, -2, 200, 60.5]);
  expect(outlier.notes.map(n => n.midi)).toContain(108);
});

test("adaptive layouts cover every valid MIDI pitch, retain white boundaries and equal widths", () => {
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const cases = [span(0, 127), [0], [127], [22, 106], [48, 84], ...Array.from({ length: 100 }, () => Array.from({ length: 8 }, () => Math.floor(random() * 128)))];
  for (const pitches of cases) {
    const layout = createAdaptivePianoLayout(pitches);
    const displayed = new Set(layout.notes.map(n => n.midi));
    expect(pitches.every(p => displayed.has(p))).toBe(true);
    expect(displayed.size).toBe(layout.notes.length);
    expect(layout.whiteKeys.length).toBeGreaterThanOrEqual(22);
    expect(layout.ranges.length).toBeLessThanOrEqual(2);
    expect(pianoLayoutKey(createAdaptivePianoLayout([...pitches].reverse()))).toBe(pianoLayoutKey(layout));
    for (const [low, high] of layout.ranges) {
      expect(layout.whiteKeys.some(n => n.midi === low)).toBe(true);
      expect(layout.whiteKeys.some(n => n.midi === high)).toBe(true);
    }
    for (const width of [320, 768, 1100]) {
      const geometries = layout.whiteKeys.map(n => pianoKeyGeometry(layout, width, n));
      expect(geometries.at(-1)!.x + geometries.at(-1)!.width).toBeCloseTo(width, 6);
      expect(geometries.every(g => Math.abs(g.width - geometries[0].width) < .001)).toBe(true);
      for (const start of pianoBreaks(layout)) {
        const gap = pianoBreakGeometry(layout, width, start);
        expect(gap.x + gap.width).toBeCloseTo(pianoKeyGeometry(layout, width, start).x, 6);
        expect(Math.ceil((layout.ranges[0][1] + 1) / 12) * 12 + 11).toBeLessThan(layout.ranges[1][0]);
      }
    }
  }
});

test("practice changes the shared keyboard per nugget and restores the default on leaving", async ({ page }) => {
  test.setTimeout(60_000);
  const scopes = [[64, 95], [...span(36, 47), ...span(84, 95)], span(21, 108)];
  await page.addInitScript(() => localStorage.setItem("replay-instrument", JSON.stringify("classic")));
  await page.route("**/rest/v1/**", route => route.fulfill({ json: accountRows(route.request().url()) ??
    (route.request().url().includes("tune_assets") ? [{ tune_key: "intro", is_global: true }] : []) }));
  await page.route("**/functions/v1/tune-coach", route => route.fulfill({ json: {
    tuneTitle: "Intro", practicePlan: scopes.map((pitches, i) => ({ itemId: `scope-${i}`, itemType: i === 2 ? "full_tune" : "nugget", instruction: "Play these notes.",
      [i === 2 ? "fullTune" : "nugget"]: { noteSequence: { notes: pitches.map((pitch, index) => ({ pitch, startTime: index, endTime: index + .5, velocity: 80 })), totalTime: pitches.length } } })),
  } }));
  await page.goto("/");
  const keyboard = page.locator(".piano-surface [data-piano-ranges]");
  await expect(keyboard).toHaveAttribute("data-piano-ranges", "48:84");
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  for (let i = 0; i < scopes.length; i++) {
    const layout = createAdaptivePianoLayout(scopes[i]);
    await expect(keyboard).toHaveAttribute("data-piano-ranges", pianoLayoutKey(layout));
    const highway = page.locator('.note-highway[data-render-ready="true"]');
    await expect(highway).toHaveAttribute("data-piano-ranges", pianoLayoutKey(layout));
    await expect(page.locator(".piano-key")).toHaveCount(layout.notes.length);
    await expect(page.locator(".piano-range-break")).toHaveCount(layout.ranges.length - 1);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(keyboard).toHaveAttribute("data-piano-ranges", pianoLayoutKey(layout));
    // All DOM keys and rail cells use the same positions, at both viewport sizes.
    for (const width of [768, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      const drift = await page.locator(".piano-key").evaluateAll(keys => Math.max(...keys.map(key => {
        const rail = document.querySelector(`.note-rail__cell[data-note="${key.getAttribute("data-note")}"]`)!;
        const a = key.getBoundingClientRect(), b = rail.getBoundingClientRect();
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width));
      })));
      expect(drift).toBeLessThan(1);
      const actual = await page.locator(".piano-key").evaluateAll(keys => keys.map(key => ({ note: key.getAttribute("data-note"), x: key.getBoundingClientRect().x, width: key.getBoundingClientRect().width })));
      const canvas = await highway.boundingBox();
      if (layout.widthScale > 1) {
        const defaultWhiteWidth = (width - 8 - 21) / 22;
        expect(actual.find(key => !key.note!.includes("#"))!.width).toBeGreaterThanOrEqual(defaultWhiteWidth * .75 - .1);
      }
      for (const key of actual) {
        const note = layout.notes.find(n => `${n.note}${n.octave}` === key.note)!;
        const g = pianoKeyGeometry(layout, canvas!.width, note);
        expect(Math.abs(key.x - canvas!.x - g.x)).toBeLessThan(1);
        expect(Math.abs(key.width - g.width)).toBeLessThan(1);
      }
    }
    if (i === 2) {
      await page.locator(".note-highway-viewport").evaluate(el => { el.scrollLeft = 200; });
      await expect.poll(() => page.locator(".piano-surface > div").evaluate(el => el.scrollLeft)).toBe(200);
    } else await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(keyboard).toHaveAttribute("data-piano-ranges", pianoLayoutKey(createAdaptivePianoLayout(scopes[1])));
  await expect.poll(() => page.locator(".piano-surface > div").evaluate(el => el.scrollLeft)).toBe(0);
  await expect.poll(() => page.locator(".note-highway-viewport").evaluate(el => el.scrollLeft)).toBe(0);
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(keyboard).toHaveAttribute("data-piano-ranges", "48:84");
  await expect(page.locator(".piano-key")).toHaveCount(37);
  await expect(page.locator(".piano-range-break")).toHaveCount(0);
});
