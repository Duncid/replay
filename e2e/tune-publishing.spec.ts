import { expect, test } from "@playwright/test";

test("Gymnopdie instrument-only exports bundle all tune and practice notes", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // Exercise actual Vite-discovered assets, including the cold-load publish path.
    const bundler = await import("/src/utils/tuneAssetBundler.ts");
    await bundler.preloadLocalTuneAssets("gymnopdie");
    const bundle = bundler.bundleSingleTuneAssets("gymnopdie");
    const notes = bundle?.noteSequence.notes as Array<{ instrument: number }> | undefined;
    return {
      valid: bundler.validateTuneForPublishing("gymnopdie").isValid,
      notes: notes?.length,
      inst1: notes?.filter(note => note.instrument === 0).length,
      inst2: notes?.filter(note => note.instrument === 1).length,
      nuggets: bundle?.nuggets?.length,
      assemblies: bundle?.assemblies?.length,
      emptyNuggets: bundle?.nuggets?.filter(item => !(item.noteSequence as { notes?: unknown[] })?.notes?.length).map(item => item.id),
      emptyAssemblies: bundle?.assemblies?.filter(item => !(item.noteSequence as { notes?: unknown[] })?.notes?.length).map(item => item.id),
    };
  });
  expect(result).toEqual({ valid: true, notes: 455, inst1: 138, inst2: 317,
    nuggets: 127, assemblies: 45, emptyNuggets: [], emptyAssemblies: [] });
});