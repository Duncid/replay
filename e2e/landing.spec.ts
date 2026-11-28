import { expect, test } from "@playwright/test";

test("visitors see the practice preview and can enter the existing sign-in flow", async ({ page }) => {
  const accountRequests: string[] = [];
  await page.route("**/*.supabase.co/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/tune_assets")) {
      expect(url.searchParams.get("is_global")).toBe("eq.true");
      expect(url.searchParams.get("curriculum_versions.status")).toBe("eq.published");
      return route.fulfill({ json: [] });
    }
    if (["/rest/v1/language_settings", "/rest/v1/language_strings"].includes(url.pathname)) return route.fulfill({ json: [] });
    accountRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find your rhythm." })).toBeVisible();
  const preview = page.getByRole("img", { name: /St Louis Blues player practice/ });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(2388);
  expect(accountRequests).toEqual([]);
  await page.getByRole("link", { name: "Start playing" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  const signup = page.getByRole("dialog", { name: "Create account", exact: true });
  await expect(signup).toBeVisible();
  await expect(page.getByText("Create your account", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Lovable" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await signup.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Find your rhythm." })).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("the muted practice loop plays, can be paused, and gives reduced-motion visitors a still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?preview=video");
  const video = page.locator(".landing-practice-video");
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
  expect(await video.evaluate((element: HTMLVideoElement) => ({ muted: element.muted, loop: element.loop, inline: element.playsInline })))
    .toEqual({ muted: true, loop: true, inline: true });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause preview" }).click();
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).toHaveCount(0);
  await expect(page.getByRole("img", { name: /St Louis Blues player practice/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /St Louis Blues player practice/ })).toHaveAttribute("src", "/marketing/st-louis-blues-practice.png");
  await page.route("**/marketing/st-louis-blues-loop.mp4", route => route.abort());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect(video).toHaveCount(0);
  await expect(page.getByRole("img", { name: /St Louis Blues player practice/ })).toBeVisible();
});

test("the iPad leans back at center, tilts inversely, and respects reduced motion and touch", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const ipad = page.getByTestId("landing-ipad");
  await expect(ipad).toBeVisible();
  const transform = () => ipad.evaluate(element => getComputedStyle(element).transform);
  const orientation = () => ipad.evaluate(element => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { horizontal: matrix.m13, pitch: Math.atan2(matrix.m23, matrix.m22) * 180 / Math.PI };
  });
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect.poll(async () => (await orientation()).pitch).toBeCloseTo(16, 2);
  await expect.poll(async () => (await orientation()).horizontal).toBeCloseTo(0, 4);
  const initial = await transform();
  await page.mouse.move(viewport.width * .9, viewport.height * .9);
  if (!isMobile) {
    await expect.poll(async () => (await orientation()).horizontal).toBeGreaterThan(0);
    await expect.poll(async () => (await orientation()).pitch).toBeGreaterThan(20);
    await page.mouse.move(viewport.width * .1, viewport.height * .1);
    await expect.poll(async () => (await orientation()).horizontal).toBeLessThan(0);
    await expect.poll(async () => (await orientation()).pitch).toBeLessThan(12);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await expect.poll(async () => (await orientation()).pitch).toBeCloseTo(16, 2);
    await expect.poll(async () => (await orientation()).horizontal).toBeCloseTo(0, 4);
  }
  else await expect(ipad).toHaveCSS("transform", initial);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(ipad).toHaveCSS("transition-duration", "0s");
  const still = await transform();
  await page.mouse.move(700, 500);
  await expect(ipad).toHaveCSS("transform", still);
});

test("French visitors see catalogue edits, translated demo titles and localised sign-in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("replay-language", JSON.stringify("fr-FR")));
  await page.route("**/*.supabase.co/**", route => {
    const url = new URL(route.request().url());
    const isFrench = url.pathname.endsWith("/language_strings") && url.searchParams.get("locale") === "eq.fr-FR";
    return route.fulfill({ json: isFrench ? [
      { locale: "fr-FR", kind: "ui", key: "landing.headline", value: "À vous de jouer !" },
      { locale: "fr-FR", kind: "tune", key: "st-louis-blues", value: "Le blues de Saint-Louis" },
    ] : [] });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "À vous de jouer !" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Commencer à jouer" })).toBeVisible();
  await expect(page.locator(".landing-tune-title")).toHaveText("Le blues de Saint-Louis");
  await expect(page.locator(".landing-demo-title h2")).toHaveText("Le blues de Saint-Louis");
  await expect(page.getByRole("img", { name: /En direct : Le blues de Saint-Louis/ })).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Application interactive de piano/);
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(await (await page.request.get(href!)).json()).toMatchObject({ lang: "fr-FR", description: "Application interactive de piano et d’improvisation musicale" });
  await page.getByRole("link", { name: "Se connecter", exact: true }).click();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await expect(page.getByRole("button", { name: "Envoyer le lien de réinitialisation" })).toBeVisible();
});
