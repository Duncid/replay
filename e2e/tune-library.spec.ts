import { expect, test } from "@playwright/test";
import { getTuneAvailability, type TuneLibrarySnapshot } from "../src/utils/tuneLibrary";

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

test("student tune list makes no teacher calls and blocks locked selection", async ({ page }) => {
  const teacherCalls: string[] = [];
  page.on("request", request => {
    if (request.url().includes("teacher-greet")) teacherCalls.push(request.url());
  });
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const body = table === "tune_assets"
      ? [{ tune_key: "intro", briefing: null }, { tune_key: "st-louis-blues", briefing: null }]
      : table === "curriculum_exports" ? { snapshot } : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Practice: intro", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Locked: st-louis-blues", exact: true })).toBeDisabled();
  expect(teacherCalls).toEqual([]);
});

test("Admin navigation opens Quest and returns to student tunes", async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Admin", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Quest", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Tunes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What would you like to play?" })).toBeVisible();
});

const publishedTuneRoute = async (route: any) => {
  const url = new URL(route.request().url());
  const table = url.pathname.split("/").pop();
  const requested = url.searchParams.get("tune_key")?.replace(/^eq\./, "");
  const body = table === "tune_assets"
    ? requested
      ? [{ tune_key: requested, briefing: null }]
      : [{ tune_key: "intro", briefing: null }, { tune_key: "st-louis-blues", briefing: null }]
    : table === "curriculum_exports" ? { snapshot } : [];
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
};

test("Tune Management in the menu loads the published tune that was picked", async ({ page }) => {
  await page.route("**/rest/v1/**", publishedTuneRoute);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Admin", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Tune Management", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Published", exact: true }).hover();
  await page.getByRole("menuitem", { name: "st-louis-blues", exact: true }).click();
  await expect(page.locator("div.sticky").first().getByText("st-louis-blues", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("picking an unpublished tune from the menu offers Publish", async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Admin", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Tune Management", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Un-Published", exact: true }).hover();
  await page.getByRole("menuitem", { name: "gymnopdie", exact: true }).click();
  await expect(page.locator("div.sticky").first().getByText("gymnopdie", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
});