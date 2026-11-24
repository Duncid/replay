import JSZip from "jszip";
import { test, expect, accountRows } from "./fixtures";

const xml = '<score-partwise><work><work-title>Waltz in A Minor</work-title></work><movement-title>Different movement</movement-title><identification><creator type="composer">Frédéric Chopin</creator><creator type="arranger">Not the composer</creator></identification></score-partwise>';

test("MXL prefills title and composer and submits the user's edits", async ({ page }) => {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>');
  zip.file("score.xml", xml);
  await page.route("**/rest/v1/**", route => route.fulfill({ json: accountRows(route.request().url()) ??
    (route.request().url().includes("/tune_assets") ? [{ tune_key: "intro", is_global: true, note_sequence: { notes: [{ pitch: 60, startTime: 0, endTime: 1 }], totalTime: 1 } }] : []) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Add a tune", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a .mxl file", exact: true }).click();
  await (await chooser).setFiles({ name: "unhelpful-filename.mxl", mimeType: "application/vnd.recordare.musicxml", buffer: await zip.generateAsync({ type: "nodebuffer" }) });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Waltz in A Minor");
  await expect(page.getByLabel("Composer", { exact: true })).toHaveValue("Frédéric Chopin");
  await page.getByLabel("Title", { exact: true }).fill("My Waltz");
  await page.getByLabel("Composer", { exact: true }).fill("F. Chopin");
  await page.route("**/storage/v1/object/tune-sources/**", route => route.fulfill({ json: { Key: "uploaded" } }));
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/functions/v1/tune-build", async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { jobId: "test-job", status: "running" } });
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect.poll(() => submitted?.composer).toBe("F. Chopin");
  expect(submitted?.title).toBe("My Waltz");
  expect(submitted?.tuneKey).toBe("my-waltz");
});

test("plain XML title fallback and missing composer metadata", async ({ page }) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { parseMusicXmlMetadata: parse, readMusicXmlMetadata: read } = await import("/src/utils/musicXmlMetadata.ts");
    return {
      movement: parse('<score-partwise><movement-title>Gymnopédie</movement-title><identification><creator type="composer">Erik Satie(1866 – 1925)</creator></identification></score-partwise>'),
      missing: await read(new File(['<score-partwise/>'], 'fallback.xml')),
      invalid: parse('not xml'),
      placeholder: parse('<score-partwise><identification><creator type="composer">Music21</creator></identification></score-partwise>'),
    };
  });
  expect(results).toEqual({ movement: { title: "Gymnopédie", composer: "Erik Satie" },
    missing: { title: null, composer: null }, invalid: { title: null, composer: null }, placeholder: { title: null, composer: null } });
});