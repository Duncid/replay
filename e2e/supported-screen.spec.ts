import { expect, test, type Page } from "@playwright/test";
import { accountRows, sessionFixture, sessionKey } from "./fixtures";
import { isSupportedScreen } from "../src/hooks/useSupportedScreen";

const heading = "A little more room to play";

async function mockAccount(page: Page, restored = true) {
  const session = sessionFixture();
  const profileRequests: string[] = [];
  await page.addInitScript(({ session, key, restored }) => {
    if (restored) localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem("replay-instrument", JSON.stringify("classic"));
  }, { session, key: sessionKey, restored });
  await page.route("**/*.supabase.co/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) return route.fulfill({ json: session });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: session.user });
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.includes("/rest/v1/")) {
      if (url.pathname.endsWith("/local_users")) profileRequests.push(url.href);
      return route.fulfill({ json: accountRows(url.href) ?? [] });
    }
    return route.abort();
  });
  return profileRequests;
}

test("screen eligibility uses exact width boundaries and is orientation independent", () => {
  expect(isSupportedScreen(699, 1024, 1366)).toBe(false);
  expect(isSupportedScreen(700, 1024, 1366)).toBe(true);
  expect(isSupportedScreen(1000, 599, 1000)).toBe(false);
  expect(isSupportedScreen(1000, 600, 1000)).toBe(true);
  expect(isSupportedScreen(844, 390, 844)).toBe(false);
  expect(isSupportedScreen(844, 844, 390)).toBe(false);
});

for (const [width, height] of [[390, 844], [844, 390]]) {
  for (const restored of [false, true]) {
    test(`${restored ? "restored session" : "signed-out phone"} is blocked at ${width}×${height}, including /play`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ viewport: { width, height }, screen: { width, height } });
      const page = await context.newPage();
      try {
        // WebKit's viewport emulation otherwise changes screen dimensions too.
        await page.addInitScript(({ width, height }) => {
          Object.defineProperties(window.screen, { width: { get: () => width }, height: { get: () => height } });
        }, { width, height });
        const requests = await mockAccount(page, restored);
        await page.goto("/");
        if (!restored) {
          await expect(page.getByRole("heading", { name: "Find your rhythm." })).toBeVisible();
          await page.getByRole("link", { name: "Start playing", exact: true }).click();
        }
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        await expect(page.locator(".piano-surface, [data-guest-workspace], .guest-entry-key-flight")).toHaveCount(0);
        await expect(page.locator(".landing-live-preview")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(restored ? 1 : 0);
        await page.goto("/play");
        await expect(page).toHaveURL(restored ? /\/$/ : /\/play$/);
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        await page.reload();
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        expect(requests).toEqual([]);
        await expect(page.getByRole("link", { name: "Noodlyn home", exact: true })).toBeVisible();
        await expect(page.locator("[data-screen-restriction] svg")).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath("screen-restriction.png"), animations: "disabled" });
        await page.getByRole("link", { name: "Back to home", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Find your rhythm." })).toBeVisible();
        await expect(page.locator("[data-guest-workspace]")).toHaveCount(0);
        await page.getByRole("link", { name: "Start playing", exact: true }).click();
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        // A wide layout viewport must not let a phone through.
        await page.setViewportSize({ width: 1000, height: 700 });
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      } finally { await context.close(); }
    });
  }
}

test("narrow window opens automatically at 700 px and cleans up when narrowed", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(window.screen, { width: { get: () => 1024 }, height: { get: () => 1366 } });
  });
  await page.setViewportSize({ width: 699, height: 900 });
  const requests = await mockAccount(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  expect(requests).toEqual([]);
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator(".piano-surface")).toBeVisible();
  await page.keyboard.down("e");
  await expect(page.getByRole("button", { name: "C4", exact: true })).toHaveAttribute("data-activity", "user");
  await page.setViewportSize({ width: 699, height: 900 });
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.locator(".piano-surface")).toHaveCount(0);
  await page.keyboard.up("e");
  await page.setViewportSize({ width: 820, height: 400 });
  await expect(page.locator(".piano-surface")).toBeVisible();
  await expect(page.getByRole("button", { name: "C4", exact: true })).not.toHaveAttribute("data-activity");
});

test("fresh sign-in reaches the restriction and sign-out restores the homepage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockAccount(page, false);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Find your rhythm." })).toBeVisible();
  await expect(page.locator(".piano-surface")).toHaveCount(0);
});

test("signed-out homepage stays accessible while play resumes when the window is wide enough", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(window.screen, { width: { get: () => 1024 }, height: { get: () => 1366 } });
  });
  await mockAccount(page, false);
  await page.setViewportSize({ width: 699, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start playing", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Start playing", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator(".piano-surface")).toBeVisible();
  await page.setViewportSize({ width: 699, height: 900 });
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.locator(".piano-surface")).toHaveCount(0);
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator(".piano-surface")).toBeVisible();
});

test("restriction honours French and reports sign-out failure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAccount(page);
  await page.addInitScript(() => localStorage.setItem("replay-language", JSON.stringify("fr")));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Un peu plus de place pour jouer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour à l’accueil", exact: true })).toBeVisible();
  // A remote logout failure still clears the local session in Supabase. A local
  // storage failure exercises the error state while the account remains signed in.
  await page.evaluate(key => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (name) {
      if (name === key) throw new Error("Storage unavailable");
      return remove.call(this, name);
    };
  }, sessionKey);
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("La déconnexion a échoué. Veuillez réessayer.");
});

test("native authentication and password recovery remain accessible on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAccount(page);
  await page.goto("/auth/native?client=native&state=12345678-1234-1234-1234-123456789abc");
  await expect(page.getByRole("button", { name: "Continue to the iPad app" })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: heading })).toHaveCount(0);
  await expect(page.locator("main, form").first()).toBeVisible();
});
