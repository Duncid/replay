import { expect, test } from "@playwright/test";
import { demoWav } from "./fixtures/demoAudio";

const previewSelector = ".landing-live-preview";

test("resizing never swaps the live keyboard for the differently sized fallback image", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.route("**/tonejs-instruments/**", route => route.abort());
  await page.goto("/");
  const preview = page.locator(previewSelector);
  await expect(preview).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(".landing-live-preview")!;
    window["resizeHiddenFrames"] = 0;
    window["resizeCanvas"] = preview.querySelector("canvas");
    const observer = new MutationObserver(() => {
      if (getComputedStyle(preview).opacity !== "1") window["resizeHiddenFrames"]++;
    });
    observer.observe(preview, { attributes: true, attributeFilter: ["data-ready", "style"] });
  });
  for (const width of [1190, 1180, 1170]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(preview).toHaveAttribute("data-ready", "true");
    await expect(page.locator('.landing-live-preview .note-highway[data-render-ready="true"]')).toBeVisible();
  }
  expect(await page.evaluate(() => window["resizeHiddenFrames"])).toBe(0);
  expect(await page.evaluate(() => window["resizeCanvas"] === document.querySelector(".landing-live-preview canvas"))).toBe(true);
  // Cross every keyboard breakpoint in both directions; key length in the scene
  // stays fixed, while the entire tilted iPad can still scale naturally.
  for (const width of [1150, 1000, 900, 820, 744, 730, 744, 820, 1000, 1180]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.landing-live-preview .note-highway[data-render-ready="true"]')).toBeVisible();
    await expect(page.locator("[data-preview-keys] .piano-key:not(.piano-key--black)").first()).toHaveCSS("height", "156px");
    await expect(preview).toHaveCSS("opacity", "1");
  }
  expect(await page.evaluate(() => window["resizeHiddenFrames"])).toBe(0);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*.supabase.co/**", route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    let interacted = false;
    document.addEventListener("pointerdown", () => { interacted = true; }, { capture: true });
    document.addEventListener("keydown", () => { interacted = true; }, { capture: true });
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      if (!interacted && !window["allowDemoAutoplay"]) return new Promise(() => {});
      return resume.call(this).then(() => { window["demoAudioRunning"] = this.state === "running"; });
    };
  });
});

test("full-tune player preview loops, pauses, ignores input, and suspends offscreen", async ({ page }) => {
  const unwantedRequests: string[] = [];
  await page.route("**/*.supabase.co/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/tune_assets") && url.searchParams.get("is_global") === "eq.true") return route.fulfill({ json: [] });
    unwantedRequests.push(url.href); return route.abort();
  });
  await page.route("**/tonejs-instruments/**", route => route.abort());
  await page.clock.install();
  await page.goto("/");
  const preview = page.locator(previewSelector);
  await expect(preview).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(preview).toHaveAttribute("data-playing", "true");
  await expect(preview).toHaveAttribute("data-note-count", "317");
  await expect(preview).toHaveAttribute("data-duration", "226");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator(".landing-demo-app")).toHaveAttribute("inert", "");
  await expect(page.locator(".piano-key:not(:disabled)")).toHaveCount(0);
  await expect.poll(() => page.locator('.piano-key[data-activity="user"]').count()).toBeGreaterThan(0);
  await expect(page.locator('.piano-key[data-activity="ai"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(preview).toHaveAttribute("data-playing", "false");
  const pausedAt = await preview.getAttribute("data-time");
  const keys = await page.locator('.piano-key[data-activity="user"]').evaluateAll(elements => elements.map(element => element.getAttribute("data-note")));
  await page.keyboard.press("e");
  await page.clock.fastForward(3000);
  expect(await preview.getAttribute("data-time")).toBe(pausedAt);
  expect(await page.locator('.piano-key[data-activity="user"]').evaluateAll(elements => elements.map(element => element.getAttribute("data-note")))).toEqual(keys);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(preview).toHaveAttribute("data-playing", "true");
  await page.clock.fastForward(226_000);
  await expect(preview).toHaveAttribute("data-cycle", "1");
  await expect(page.locator('.note-highway[data-render-ready="true"]')).toHaveCount(1);
  // Move the product below the viewport, then bring it back without changing transport state.
  await page.locator(".landing-ipad-room").evaluate(element => (element as HTMLElement).style.transform = "translateY(3000px)");
  await expect(preview).toHaveAttribute("data-playing", "false");
  const offscreenAt = await preview.getAttribute("data-time");
  await page.clock.fastForward(5000);
  expect(await preview.getAttribute("data-time")).toBe(offscreenAt);
  await page.locator(".landing-ipad-room").evaluate(element => (element as HTMLElement).style.transform = "");
  await expect(preview).toHaveAttribute("data-playing", "true");
  expect(unwantedRequests).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole("img", { name: /St Louis Blues player practice/ })).toBeVisible();
});

test("Play and Pause control acoustic sound, volume stays bounded, and tunes preserve playback", async ({ page, isMobile }) => {
  const wav = demoWav();
  const samples: string[] = [];
  await page.route("**/tonejs-instruments/samples/**", route => {
    samples.push(route.request().url());
    return route.fulfill({ body: wav, contentType: "audio/wav" });
  });
  await page.addInitScript(() => {
    window["demoVoiceStarts"] = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { window["demoVoiceStarts"]++; return start.apply(this, args); };
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(previewSelector)).toHaveAttribute("data-audio-policy", "blocked");
  await expect.poll(() => samples.length).toBe(22);
  await expect(page.locator(previewSelector)).toHaveAttribute("data-sound", "silent");
  const size = page.viewportSize()!;
  if (!isMobile) {
    await page.mouse.move(0, 0);
    await expect(page.locator(previewSelector)).toHaveAttribute("data-volume", "0.050");
    await page.mouse.move(size.width / 2, size.height / 2);
    await expect(page.locator(previewSelector)).toHaveAttribute("data-volume", "0.300");
  } else {
    await expect(page.locator(previewSelector)).toHaveAttribute("data-volume", "0.050");
    await page.mouse.move(size.width / 2, size.height / 2);
    await expect(page.locator(previewSelector)).toHaveAttribute("data-volume", "0.050");
  }
  await page.getByRole("heading", { name: "Find your rhythm." }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(previewSelector)).toHaveAttribute("data-sound", "acoustic-piano");
  expect(samples.length).toBe(22);
  expect(samples.every(url => url.includes("/samples/piano/"))).toBe(true);
  await expect(page.locator(previewSelector)).toHaveAttribute("data-sound", "acoustic-piano");
  if (!isMobile) {
    // Keep a sounding note bounded while the pointer traverses the entire screen.
    for (const [x, y] of [[0, 0], [size.width / 2, size.height / 2], [size.width, size.height]]) {
      await page.mouse.move(x, y);
      expect(Number(await page.locator(previewSelector).getAttribute("data-volume"))).toBeLessThanOrEqual(.3);
    }
    await expect(page.locator(previewSelector)).toHaveAttribute("data-volume", "0.050");
  }
  const starts = await page.evaluate(() => window["demoVoiceStarts"]);
  await expect.poll(() => page.evaluate(() => window["demoVoiceStarts"])).toBeGreaterThan(starts);
  await page.getByRole("button", { name: "Next tune" }).click();
  await expect(page.locator(previewSelector)).toHaveAttribute("data-tune", "gymnopdie");
  await expect(page.locator(previewSelector)).toHaveAttribute("data-note-count", "455");
  await expect(page.locator(previewSelector)).toHaveAttribute("data-ready", "true");
  await expect(page.locator(previewSelector)).toHaveAttribute("data-sound", "acoustic-piano");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  expect(samples.length).toBe(22);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(previewSelector)).toHaveAttribute("data-sound", "silent");
  await page.getByRole("button", { name: "Previous tune" }).click();
  await expect(page.locator(previewSelector)).toHaveAttribute("data-tune", "st-louis-blues");
  await expect(page.locator(previewSelector)).toHaveAttribute("data-playing", "false");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});

test("sample failure stays silent and the same Play control can retry", async ({ page }) => {
  await page.route("**/tonejs-instruments/samples/**", route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Piano samples could not load", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.locator(previewSelector)).toHaveAttribute("data-sound", "silent");
});

test("a graphics failure reveals the retained original image", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(page.getByRole("img", { name: /St Louis Blues player practice/ })).toBeVisible();
  await expect(page.locator(".noodlyn-landing")).toHaveAttribute("data-preview-state", "error", { timeout: 20_000 });
  await expect(page.locator(previewSelector)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
});

test("chevrons browse published public tunes, wrap, and never include private entries", async ({ page }) => {
  const sequence = { notes: [{ pitch: 48, startTime: 0, endTime: 1 }, { pitch: 84, startTime: 1, endTime: 2 }], totalTime: 2 };
  await page.route("**/rest/v1/tune_assets?**", route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("is_global")).toBe("eq.true");
    expect(url.searchParams.get("curriculum_versions.status")).toBe("eq.published");
    return route.fulfill({ json: [
      { tune_key: "st-louis-blues", is_global: true, briefing: { title: "St Louis Blues" }, composer: "W. C. Handy", note_sequence: sequence },
      { tune_key: "public-waltz", is_global: true, briefing: { title: "Public Waltz" }, composer: "Test Composer", note_sequence: sequence },
      { tune_key: "private-tune", is_global: false, briefing: { title: "Private tune" }, note_sequence: sequence },
    ] });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Next tune" })).toBeEnabled();
  await page.getByRole("button", { name: "Next tune" }).click();
  const preview = page.locator(previewSelector);
  await expect(page.locator(".landing-tune-title")).toHaveText("Public Waltz");
  await expect(preview).toHaveAttribute("data-tune", "public-waltz");
  await expect(preview).toHaveAttribute("data-note-count", "2");
  await expect(preview).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".landing-demo-title h2")).toHaveText("Public Waltz");
  await page.getByRole("button", { name: "Next tune" }).click();
  await expect(preview).toHaveAttribute("data-tune", "st-louis-blues");
  await page.getByRole("button", { name: "Previous tune" }).click();
  await expect(preview).toHaveAttribute("data-tune", "public-waltz");
  await expect(page.locator("figcaption")).not.toContainText("Full tune");
  await expect(page.getByRole("button", { name: "Enable sound" })).toHaveCount(0);
});


test("the homepage fits desktop, tablet, phone and short landscape viewports", async ({ page }) => {
  await page.route("**/tonejs-instruments/**", route => route.abort());
  await page.addInitScript(() => {
    Object.defineProperties(window.screen, { width: { get: () => 1440 }, height: { get: () => 900 } });
  });
  await page.goto("/");
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 600], [1024, 768], [768, 1024], [390, 844], [375, 667], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.locator(".landing-header, .landing-intro, .landing-ipad, .landing-cta, .landing-product figcaption, .landing-features").evaluateAll(elements => elements.length > 0 && elements.every(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.top >= -1 && box.bottom <= innerHeight + 1 && box.left >= -1 && box.right <= innerWidth + 1;
    })), { message: `Every section fits at ${width} × ${height}` }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
});

