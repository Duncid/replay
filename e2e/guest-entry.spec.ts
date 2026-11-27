import { expect, test } from "@playwright/test";
import { demoWav } from "./fixtures/demoAudio";

test.beforeEach(async ({ page }) => {
  await page.route("**/*.supabase.co/**", route => route.fulfill({ json: [] }));
  await page.route("**/tonejs-instruments/samples/**", route => route.fulfill({ body: demoWav(), contentType: "audio/wav" }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

for (const changeTune of [false, true]) {
  test(`the live iPad keyboard meets the guest keyboard${changeTune ? " after changing tunes" : ""}`, async ({ page }, testInfo) => {
    if (changeTune) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(() => localStorage.setItem("replay-display-notes", JSON.stringify("always")));
    }
    const accountRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes(".supabase.co/") && !request.url().includes("/tune_assets?")) accountRequests.push(request.url());
    });
    await page.goto("/");
    await expect(page.locator('.noodlyn-landing[data-preview-state="ready"]')).toBeVisible({ timeout: 15_000 });
    if (changeTune) {
      const previous = await page.locator(".landing-tune-title").textContent();
      await page.getByRole("button", { name: "Next tune", exact: true }).click();
      await expect(page.locator(".landing-tune-title")).not.toHaveText(previous!);
      await expect(page.locator('.noodlyn-landing[data-preview-state="ready"]')).toBeVisible({ timeout: 15_000 });
    }
    await page.evaluate(() => {
      const canvas = document.querySelector(".landing-live-preview canvas");
      const frames = [];
      window["entryFrames"] = frames;
      const arrival = [];
      window["arrivalFrames"] = arrival;
      let arrivalCount = 0;
      const sample = () => {
        const phase = document.querySelector<HTMLElement>(".guest-entry")?.dataset.entryPhase;
        const destination = document.querySelector(".guest-entry-destination");
        const targetKeys = document.querySelector("[data-guest-workspace] [data-piano-keys]");
        if (destination && targetKeys && (phase !== "idle" || location.pathname === "/play")) {
          const { x, y, width, height } = targetKeys.getBoundingClientRect();
          arrival.push({ opacity: Number(getComputedStyle(destination).opacity), x, y, width, height });
        }
        if (location.pathname === "/play" && ++arrivalCount === 12) {
          window["arrivalComplete"] = true;
          return;
        }
        if (phase !== "idle" && location.pathname !== "/play") {
          const flight = document.querySelector(".guest-entry-key-flight");
          const target = document.querySelector("[data-guest-workspace] [data-piano-keys]");
          const box = (element: Element | null) => {
            if (!element) return null;
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          };
          frames.push({ phase, canvasRetained: canvas === document.querySelector(".landing-live-preview canvas"),
            flight: box(flight), target: box(target),
            inputEnabled: !!document.querySelector("[data-guest-workspace] .piano-key:not(:disabled)"),
            volume: document.querySelector<HTMLElement>(".landing-live-preview")?.dataset.volume,
            playing: document.querySelector<HTMLElement>(".landing-live-preview")?.dataset.playing });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByRole("link", { name: "Start playing", exact: true }).click();
    // Capture the moving keyboard, not just the two static endpoints.
    await page.locator(".guest-entry-key-flight").waitFor({ state: "attached" });
    await page.screenshot({ path: testInfo.outputPath("keyboard-flight.png") });
    await expect(page).toHaveURL(/\/play$/);
    await page.waitForFunction(() => window["arrivalComplete"]);
    const arrival = await page.evaluate(() => window["arrivalFrames"]);
    const visible = arrival.findIndex(frame => frame.opacity > .99);
    expect(visible).toBeGreaterThanOrEqual(0);
    for (const frame of arrival.slice(visible)) {
      expect(frame.opacity).toBeGreaterThan(.99);
      for (const dimension of ["x", "y", "width", "height"]) {
        expect(Math.abs(frame[dimension] - arrival[visible][dimension])).toBeLessThan(1);
      }
    }
    const frames = await page.evaluate(() => window["entryFrames"]);
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.every(frame => frame.canvasRetained && !frame.inputEnabled)).toBe(true);
    const flightFrames = frames.filter(frame => frame.flight && frame.target);
    expect(flightFrames.length).toBeGreaterThan(2);
    const last = flightFrames.at(-1);
    for (const dimension of ["x", "y", "width", "height"]) {
      expect(Math.abs(last.flight[dimension] - last.target[dimension])).toBeLessThan(4);
    }
    expect(flightFrames.some(frame => frame.volume === "0.000" && frame.playing === "false")).toBe(true);
    await expect(page.getByRole("heading", { name: "What would you like to play?" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Locked: St Louis Blues", exact: true })).toBeDisabled();
    await expect(page.locator(".guest-entry-key-flight")).toHaveCount(0);
    await expect(page.locator(".piano-surface")).toHaveCount(1);
    await expect(page.locator('[data-guest-workspace] button[data-note="C4"]')).toBeEnabled();
    if (changeTune) await expect(page.locator(".note-rail")).toBeVisible();
    expect(accountRequests).toEqual([]);
    await page.goBack();
    await expect(page.getByRole("link", { name: "Start playing", exact: true })).toBeVisible();
    await expect(page.locator(".guest-entry")).toHaveAttribute("data-entry-phase", "idle");
    await page.goForward();
    await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeVisible();
    await expect(page.locator(".guest-entry-key-flight")).toHaveCount(0);
    await page.getByRole("link", { name: "Back to home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Start playing", exact: true })).toBeVisible();
    await expect(page.locator(".guest-entry")).toHaveAttribute("data-entry-phase", "idle");
    await expect(page.locator(".guest-entry-key-flight")).toHaveCount(0);
    await expect(page.locator("[data-guest-workspace]")).toHaveCount(0);
  });
}

for (const fallback of ["reduced motion", "video", "image"]) {
  test(`${fallback} enters the library without a keyboard flight`, async ({ page }) => {
    if (fallback === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
    if (fallback === "image") await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto(fallback === "video" ? "/?preview=video" : "/");
    if (fallback === "image") await expect(page.locator(".noodlyn-landing")).toHaveAttribute("data-preview-state", "error", { timeout: 20_000 });
    await page.evaluate(() => {
      window["sawFlight"] = false;
      new MutationObserver(() => { if (document.querySelector(".guest-entry-key-flight")) window["sawFlight"] = true; })
        .observe(document.body, { subtree: true, childList: true });
    });
    const start = page.getByRole("link", { name: "Start playing", exact: true });
    await start.focus();
    await start.press("Enter");
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window["sawFlight"])).toBe(false);
    await expect(page.locator(".guest-entry-destination")).not.toHaveAttribute("inert");
  });
}

test("slow guest loading falls back to navigation and repeated activation creates one history entry", async ({ page }) => {
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/(?:src\/pages\/GuestApp\.tsx|assets\/GuestApp-[^/]+\.js)(?:\?.*)?$/, async route => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  const start = page.getByRole("link", { name: "Start playing", exact: true });
  const history = await page.evaluate(() => window.history.length);
  await start.click();
  await page.locator(".landing-cta").evaluate(element => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page).toHaveURL(/\/play$/, { timeout: 4000 });
  expect(await page.evaluate(() => window.history.length)).toBe(history + 1);
  await expect(page.locator(".guest-entry-source")).toHaveCount(0);
  release!();
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "What would you like to play?" })).toBeFocused();
});

test("resizing during the flight finishes immediately without an input-blocking overlay", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.noodlyn-landing[data-preview-state="ready"]')).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Start playing", exact: true }).click();
  await page.locator(".guest-entry-key-flight").waitFor({ state: "attached" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.locator(".guest-entry-key-flight")).toHaveCount(0);
  await expect(page.locator(".guest-entry-destination")).not.toHaveAttribute("inert");
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
});

test("leaving during entry cancels pending navigation and removes the flight", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Back to Noodlyn", exact: true }).click();
  await expect(page.locator('.noodlyn-landing[data-preview-state="ready"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    // Trigger Back inside the page: a slow driver round trip can outlast the
    // animation and accidentally test navigation after arrival instead.
    const observer = new MutationObserver(() => {
      const phase = document.querySelector<HTMLElement>(".guest-entry")?.dataset.entryPhase;
      if (phase !== "animating" || !document.querySelector(".guest-entry-key-flight")) return;
      observer.disconnect();
      window["entryCancelledAt"] = {
        path: location.pathname,
        phase,
      };
      history.back();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-entry-phase"] });
  });
  await page.getByRole("link", { name: "Start playing", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => window["entryCancelledAt"])).toEqual({ path: "/", phase: "animating" });
  // Outlast the safety deadline to catch a stale callback navigating to /play.
  await page.waitForTimeout(1300);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".guest-entry-key-flight")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Apple", exact: true })).toBeVisible();
});
