import { expect, test, accountRows } from "./fixtures";
import type { Route } from "@playwright/test";
import { getTuneAvailability, isTuneAcquired, publishedTunesInListOrder, type TuneLibrarySnapshot } from "../src/utils/tuneLibrary";

import { getTunePreview } from "../src/utils/tunePreview";

const snapshot: TuneLibrarySnapshot = {
  tunes: [
    { tuneKey: "first-node", musicRef: "intro" },
    { tuneKey: "second-node", musicRef: "st-louis-blues" },
  ],
  edges: [{ source_key: "first-node", target_key: "second-node", edge_type: "tune_next" }],
};

test("a prerequisite tune locks the next published tune", () => {
  expect(getTuneAvailability("intro", snapshot, new Set()).unlocked).toBe(true);
  expect(getTuneAvailability("st-louis-blues", snapshot, new Set())).toEqual({ unlocked: false, prerequisites: ["intro"] });
});

test("completing the prerequisite music reference unlocks its successor", () => {
  expect(getTuneAvailability("st-louis-blues", snapshot, new Set(["intro"])).unlocked).toBe(true);
});

test("curriculum-key completion also unlocks a successor", () => {
  expect(getTuneAvailability("st-louis-blues", snapshot, new Set(["first-node"])).unlocked).toBe(true);
});

test("tune-only progression does not require lessons or skills", () => {
  const curriculum = { ...snapshot, edges: [{ source_key: "first-node", target_key: "old-skill", edge_type: "tune_requires_skill" }] };
  expect(getTuneAvailability("intro", curriculum, new Set()).unlocked).toBe(true);
});

test("an acquired tune stays available", () => {
  expect(getTuneAvailability("st-louis-blues", snapshot, new Set(["st-louis-blues"])).unlocked).toBe(true);
});

test("published tunes outside the curriculum remain available", () => {
  expect(getTuneAvailability("new-tune", snapshot, new Set()).unlocked).toBe(true);
});

test("a newly published tune joins the end while its newest version plays", () => {
  const rows = [
    { tune_key: "intro", version: 1 },
    { tune_key: "st-louis-blues", version: 1 },
    { tune_key: "intro", version: 2 },
    { tune_key: "waltz-in-a-minor-chopin", version: 1 },
  ];
  expect(publishedTunesInListOrder(rows)).toEqual([
    { tune_key: "intro", version: 2 },
    { tune_key: "st-louis-blues", version: 1 },
    { tune_key: "waltz-in-a-minor-chopin", version: 1 },
  ]);
});

test("student tune list makes no teacher calls and blocks locked selection", async ({ page }) => {
  const teacherCalls: string[] = [];
  page.on("request", request => {
    if (request.url().includes("teacher-greet")) teacherCalls.push(request.url());
  });
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const body = table === "tune_assets"
      ? [{ tune_key: "intro", is_global: true, note_sequence: { notes: [{ pitch: 60, startTime: 0, endTime: 2 }], totalTime: 3 } }, { tune_key: "st-louis-blues", is_global: true, briefing: null }]
      : table === "curriculum_exports" ? { snapshot } : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(route.request().url()) ?? body) });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Practice: Intro", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Locked: St Louis Blues", exact: true })).toBeDisabled();
  await expect(page.getByText("1 note · 3 sec", { exact: true })).toBeVisible();
  expect(teacherCalls).toEqual([]);
});

test("the student tune list puts a newly uploaded tune at the end", async ({ page }) => {
  const orders: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/tune_assets")) orders.push(url.searchParams.get("order") ?? "");
  });
  const sequence = (pitch: number) => ({ notes: [{ pitch, startTime: 0, endTime: 2 }], totalTime: 3 });
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const body = table === "tune_assets"
      ? [
          { tune_key: "intro", is_global: true, owner_user_id: null, note_sequence: sequence(60) },
          { tune_key: "st-louis-blues", is_global: true, owner_user_id: null, note_sequence: sequence(62) },
          { tune_key: "waltz-in-a-minor-chopin", is_global: true, owner_user_id: null, note_sequence: sequence(64) },
        ]
      : table === "curriculum_exports" ? { snapshot } : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(url.href) ?? body) });
  });
  await page.goto("/");
  const items = page.locator('ul[aria-label="Tunes"] li');
  const cards = items.filter({ hasNot: page.getByRole("button", { name: "Add a tune", exact: true }) });
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Intro");
  await expect(cards.last()).toContainText("Waltz In A Minor Chopin");
  await expect(items.last()).toContainText("Add a tune");
  expect(orders).toContain("curriculum_versions(published_at).asc");
});

test("Admin navigation opens Quest and returns to student tunes", async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(route.request().url()) ?? []) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Quest", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Tunes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What would you like to play?" })).toBeVisible();
});

const publishedTuneRoute = async (route: Route) => {
  const url = new URL(route.request().url());
  const table = url.pathname.split("/").pop();
  const requested = url.searchParams.get("tune_key")?.replace(/^eq\./, "");
  const body = table === "tune_assets"
    ? requested
      ? [{ tune_key: requested, briefing: null }]
      : [{ tune_key: "intro", briefing: null }, { tune_key: "st-louis-blues", briefing: null }]
    : table === "curriculum_exports" ? { snapshot } : [];
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(route.request().url()) ?? body) });
};

test("Tune Management in the menu loads the published tune that was picked", async ({ page }) => {
  await page.route("**/rest/v1/**", publishedTuneRoute);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tune Management", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Published", exact: true }).hover();
  await page.getByRole("menuitem", { name: "st-louis-blues", exact: true }).click();
  await expect(page.locator("div.sticky").first().getByText("st-louis-blues", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("picking an unpublished tune from the menu offers Publish", async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(route.request().url()) ?? []) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tune Management", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Un-Published", exact: true }).hover();
  await page.getByRole("menuitem", { name: "gymnopdie", exact: true }).click();
  await expect(page.locator("div.sticky").first().getByText("gymnopdie", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
});

test("card completion recognizes both asset and curriculum identifiers", () => {
  expect(isTuneAcquired("intro", snapshot, new Set(["first-node"]))).toBe(true);
  expect(isTuneAcquired("intro", snapshot, new Set(["intro"]))).toBe(true);
  expect(isTuneAcquired("st-louis-blues", snapshot, new Set(["intro"]))).toBe(false);
});

test("previews bound drawing work while retaining full tune metadata", () => {
  const notes = Array.from({ length: 100 }, (_, index) => ({ pitch: 60, startTime: index, endTime: index + 1 }));
  const preview = getTunePreview({ notes: [null, { pitch: -1 }, ...notes], totalTime: 110 });
  expect(preview?.notes).toHaveLength(14);
  expect(preview?.noteCount).toBe(100);
  expect(preview?.duration).toBe(110);
  expect(getTunePreview(null)).toBeUndefined();
  expect(getTunePreview({ notes: [] })).toBeUndefined();
});


test("Admin Debug activation persists and controls header tools", async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(route.request().url()) ?? []) }));
  await page.goto("/");
  await expect(page.locator("#debug-mode")).toHaveCount(0);
  const tools = page.getByRole("button", { name: "Debug menu", exact: true });
  await expect(tools).toHaveCount(0);
  const openAdmin = async () => {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  };
  await openAdmin();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Debug", exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(tools).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("replay-debug-mode:account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))).toBe("true");
  await page.reload();
  await expect(tools).toBeVisible();
  await openAdmin();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(tools).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("replay-debug-mode:account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))).toBe("false");
});

test("the add-a-tune start screen explains .mxl, links to MuseScore and opens the picker", async ({ page }) => {
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const body = table === "tune_assets"
      ? [{ tune_key: "intro", is_global: true, owner_user_id: null, note_sequence: { notes: [{ pitch: 60, startTime: 0, endTime: 2 }], totalTime: 3 } }]
      : table === "curriculum_exports" ? { snapshot } : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(accountRows(url.href) ?? body) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add a tune", exact: true }).click();
  const screen = page.getByRole("dialog");
  await expect(screen.getByRole("heading", { name: "Add a tune", exact: true })).toBeVisible();
  await expect(screen.getByText(/compressed MusicXML/i)).toBeVisible();
  const link = screen.getByRole("link", { name: /MuseScore/i });
  await expect(link).toHaveAttribute("href", "https://musescore.com/");
  await expect(link).toHaveAttribute("target", "_blank");
  const chooser = page.waitForEvent("filechooser");
  await screen.getByRole("button", { name: "Choose a .mxl file", exact: true }).click();
  const picked = await chooser;
  expect(picked.isMultiple()).toBe(false);
  await picked.setFiles("/tmp/browser/add-tune-start/moonlight-sonata.mxl");
  await expect(page.getByRole("heading", { name: "Name your tune", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("moonlight sonata");
});
