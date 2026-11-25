import { test, expect } from "./fixtures";

test("overview lists items smallest first and flags repeated passages", async ({ page }) => {
  await page.goto("/");
  const items = await page.evaluate(async () => {
    const { buildTuneOverview } = await import("/src/utils/tuneOverview.ts");
    const phrase = (t0: number) => [60, 62, 64].map((pitch, i) => ({ pitch, startTime: t0 + i * 0.5, endTime: t0 + i * 0.5 + 0.5 }));
    return buildTuneOverview([
      { kind: "full", id: "Full", label: "Full tune", notes: [...phrase(0), ...phrase(4), { pitch: 70, startTime: 8, endTime: 9 }] },
      { kind: "assembly", id: "A1", label: "A", notes: [...phrase(0), ...phrase(4)] },
      { kind: "nugget", id: "N1", label: "Theme", notes: phrase(0) },
      { kind: "nugget", id: "N2", label: "Theme again", notes: phrase(4) },
      { kind: "nugget", id: "N3", label: "Ending", notes: [{ pitch: 70, startTime: 8, endTime: 9 }] },
    ]).map((i) => ({ id: i.id, duplicateOf: i.duplicateOf ?? null }));
  });
  expect(items.map((i) => i.id)).toEqual(["N3", "N1", "N2", "A1", "Full"]);
  expect(items.find((i) => i.id === "N2")?.duplicateOf).toBe("N1");
  expect(items.find((i) => i.id === "N1")?.duplicateOf).toBeNull();
});
