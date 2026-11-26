import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:8081" });

test("MusicXML composer extraction distinguishes Chopin and Satie from other credits", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const extract = async (score: string) => {
      const { data, error } = await supabase.rpc("musicxml_composer", { score });
      if (error) throw error;
      return data;
    };
    return {
      chopin: await extract('<score-partwise><identification><creator type="composer">Frédéric Chopin</creator><creator type="arranger">Another person</creator></identification></score-partwise>'),
      satie: await extract('<score-partwise><identification><creator type="composer">Erik Satie(1866 – 1925)</creator></identification></score-partwise>'),
      placeholder: await extract('<score-partwise><identification><creator type="composer">Music21</creator></identification></score-partwise>'),
      missing: await extract('<score-partwise/>'),
      malformed: await extract('not xml'),
      escaped: await extract('<score-partwise><identification><creator type="composer">A &amp; B</creator></identification></score-partwise>'),
    };
  });
  expect(result).toEqual({ chopin: "Frédéric Chopin", satie: "Erik Satie", placeholder: null, missing: null, malformed: null, escaped: "A & B" });
});
