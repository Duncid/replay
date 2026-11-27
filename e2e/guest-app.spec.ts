import { expect, test } from "@playwright/test";
import { demoWav } from "./fixtures/demoAudio";
import intro from "../src/music/intro/output/tune.ns.json" with { type: "json" };

test.beforeEach(async ({ page }) => {
  await page.route("**/tonejs-instruments/samples/**", route => route.fulfill({ body: demoWav(), contentType: "audio/wav" }));
});

test("guests get the app with only Intro playable, without account or coach requests", async ({ page, isMobile }) => {
  const requests: string[] = [];
  await page.route("**/*.supabase.co/**", route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "What would you like to play?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Locked: St Louis Blues", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Preview: St Louis Blues", exact: true })).toBeDisabled();
  await expect(page.getByRole("list", { name: "Tunes", exact: true }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add a tune" })).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.locator(".piano-surface")).toBeVisible();
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  await expect(page.locator('.note-highway[data-render-ready="true"]')).toBeVisible();
  await expect(page.locator(".tune-practice")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeVisible();
  for (const note of intro.notes) {
    const name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][note.pitch % 12] + (Math.floor(note.pitch / 12) - 1);
    const key = page.locator(`.piano-surface button[data-note="${name}"]`);
    const box = await key.boundingBox();
    const position = { x: box!.width / 2, y: box!.height * .85 };
    if (isMobile) await key.tap({ position }); else await key.click({ position });
  }
  await expect(page.getByText("You played Intro! Keep practising, or return to your tunes.")).toBeVisible();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page.getByRole("button", { name: "Locked: St Louis Blues", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Sign up for free", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  const signup = page.getByRole("dialog", { name: "Create account", exact: true });
  await expect(signup.getByText("Create your account", { exact: true })).toBeVisible();
  await signup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(signup).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const signin = page.getByRole("dialog", { name: "Sign in", exact: true });
  await expect(signin.getByText("Sign in to play", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/play$/);
  await signin.getByRole("button", { name: "Close", exact: true }).click();
  await expect(signin).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(signup.getByText("Create your account", { exact: true })).toBeVisible();
});

test("sign-up overlays the guest app, stops playback, and preserves Intro when dismissed", async ({ page }) => {
  await page.route("**/*.supabase.co/**", route => route.abort());
  await page.goto("/play");
  await page.getByRole("button", { name: "Preview: Intro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop preview: Intro", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  const signup = page.getByRole("dialog", { name: "Create account", exact: true });
  await expect(signup).toBeVisible();
  await expect(page.locator('[aria-label="Stop preview: Intro"]')).toHaveCount(0);
  await signup.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Practice: Intro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop preview: Intro", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(signup.getByText("Create your account", { exact: true })).toBeVisible();
  await expect(signup.getByRole("button", { name: "Continue with Apple", exact: true })).toBeVisible();
  await expect(page.locator(".tune-practice")).toBeVisible();
  await expect(page.locator('.piano-surface button[data-note="C4"]')).toBeDisabled();
  await signup.getByLabel("Email", { exact: true }).fill("guest@example.test");
  await page.keyboard.press("Escape");
  await expect(signup).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeFocused();
  await expect(page.locator(".tune-practice")).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await expect(page.locator('.piano-surface button[data-note="C4"]')).toBeEnabled();
});
