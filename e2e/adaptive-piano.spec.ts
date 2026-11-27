import { expect, test, accountRows } from "./fixtures";
import { createAdaptivePianoLayout, pianoKeyGeometry, pianoLayoutKey, pianoBreakGeometry, pianoBreaks, defaultWhiteKeyCount } from "../src/components/pianoLayout";

const span = (low: number, high: number) => Array.from({ length: high - low + 1 }, (_, i) => low + i);

test("adaptive ranges keep the default, shift, expand or split without losing pitches", () => {
  expect(createAdaptivePianoLayout([]).ranges).toEqual([[48, 84]]);
  expect(createAdaptivePianoLayout([52, 81]).ranges).toEqual([[48, 84]]);
  expect(createAdaptivePianoLayout([64, 95]).whiteKeys).toHaveLength(22);
  expect(createAdaptivePianoLayout(span(36, 83)).ranges).toEqual([[36, 83]]);
  const split = createAdaptivePianoLayout([...span(36, 47), ...span(84, 95)]);
  expect(split.ranges).toHaveLength(2);
  expect(split.whiteKeys.length).toBeGreaterThanOrEqual(22);
  expect(split.widthScale).toBe(1);
  expect(createAdaptivePianoLayout(span(21, 108)).widthScale).toBe(1);
  // A single rare/outlying note is required too; malformed values are ignored.
  const outlier = createAdaptivePianoLayout([60, 60, 60, 108, NaN, -2, 200, 60.5]);
  expect(outlier.notes.map(n => n.midi)).toContain(108);
});

test("adaptive layouts cover every valid MIDI pitch, retain white boundaries and equal widths", () => {
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const cases = [span(0, 127), [0], [127], [22, 106], [48, 84], ...Array.from({ length: 100 }, () => Array.from({ length: 8 }, () => Math.floor(random() * 128)))];
  for (const width of [700, 744, 820, 1024, 1133, 1180, 1366]) for (const pitches of cases) {
    const layout = createAdaptivePianoLayout(pitches, width);
    const displayed = new Set(layout.notes.map(n => n.midi));
    expect(pitches.every(p => displayed.has(p))).toBe(true);
    expect(displayed.size).toBe(layout.notes.length);
    expect(layout.whiteKeys.length).toBeGreaterThanOrEqual(defaultWhiteKeyCount(width));
    expect(layout.ranges.length).toBeLessThanOrEqual(2);
    expect(pianoLayoutKey(createAdaptivePianoLayout([...pitches].reverse(), width))).toBe(pianoLayoutKey(layout));
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

test("responsive defaults and single-white-key expansion use exact boundaries", () => {
  for (const [width, count] of [[0, 22], [320, 8], [700, 14], [733, 14], [734, 15], [899, 15], [900, 18], [1149, 18], [1150, 22]]) {
    expect(defaultWhiteKeyCount(width)).toBe(count);
    expect(createAdaptivePianoLayout([], width).whiteKeys).toHaveLength(count);
  }
  expect(defaultWhiteKeyCount(NaN)).toBe(22);
  expect(createAdaptivePianoLayout(span(60, 88), 820).whiteKeys).toHaveLength(17);
  const sharpEdges = createAdaptivePianoLayout([61, 85], 820);
  expect(sharpEdges.ranges).toEqual([[60, 86]]);
});

test("practice shares responsive geometry and keeps all notes on screen", async ({ page }) => {
  test.setTimeout(120_000);
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
  const viewport = page.locator(".piano-surface > div");
  await expect(keyboard).toBeVisible();
  const initialWidth = await viewport.evaluate(el => el.clientWidth);
  await expect(keyboard).toHaveAttribute("data-piano-ranges", pianoLayoutKey(createAdaptivePianoLayout([], initialWidth)));
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  for (let i = 0; i < scopes.length; i++) {
    const highway = page.locator('.note-highway[data-render-ready="true"]');
    await expect(highway).toBeVisible();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    for (const [width, height] of [[744, 1133], [1133, 744], [820, 1180], [1180, 820], [1024, 1366], [1366, 1024]]) {
      await page.setViewportSize({ width, height });
      const availableWidth = await viewport.evaluate(el => el.clientWidth);
      const layout = createAdaptivePianoLayout(scopes[i], availableWidth);
      await expect(keyboard).toHaveAttribute("data-piano-ranges", pianoLayoutKey(layout));
      await expect(highway).toHaveAttribute("data-piano-ranges", pianoLayoutKey(layout));
      await expect(page.locator(".piano-key")).toHaveCount(layout.notes.length);
      const drift = await page.locator(".piano-key").evaluateAll(keys => Math.max(...keys.map(key => {
        const rail = document.querySelector(`.note-rail__cell[data-note="${key.getAttribute("data-note")}"]`)!;
        const a = key.getBoundingClientRect(), b = rail.getBoundingClientRect();
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width));
      })));
      expect(drift).toBeLessThan(1);
      const actual = await page.locator(".piano-key").evaluateAll(keys => keys.map(key => ({ note: key.getAttribute("data-note"), x: key.getBoundingClientRect().x, width: key.getBoundingClientRect().width })));
      const canvas = (await highway.boundingBox())!;
      for (const key of actual) {
        const note = layout.notes.find(n => `${n.note}${n.octave}` === key.note)!;
        const g = pianoKeyGeometry(layout, canvas.width, note);
        expect(Math.abs(key.x - canvas.x - g.x)).toBeLessThan(1);
        expect(Math.abs(key.width - g.width)).toBeLessThan(1);
      }
      expect(await viewport.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await highway.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    if (i < scopes.length - 1) await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  const width = await viewport.evaluate(el => el.clientWidth);
  const idle = createAdaptivePianoLayout([], width);
  await expect(keyboard).toHaveAttribute("data-piano-ranges", pianoLayoutKey(idle));
  await expect(page.locator(".piano-key")).toHaveCount(idle.notes.length);
  await expect(page.locator(".piano-range-break")).toHaveCount(0);
  // Resizing releases a held computer-keyboard note even when the key remains visible.
  await page.keyboard.down("e");
  await expect(page.getByRole("button", { name: "C4", exact: true })).toHaveAttribute("data-activity", "user");
  await page.setViewportSize({ width: 744, height: 1133 });
  await expect(page.getByRole("button", { name: "C4", exact: true })).not.toHaveAttribute("data-activity");
  await page.keyboard.up("e");
});
