import { test, expect } from "./fixtures";
import { initialLanguages, isLanguageSettings, translationLocales, type LanguageSettings, type Translation } from "../src/lib/languages";

test("language settings accept constrained database values and reject invalid formatting modes", () => {
  for (const language of initialLanguages) expect(isLanguageSettings(language)).toBe(true);
  expect(isLanguageSettings({ ...initialLanguages[0], notation: "invalid" })).toBe(false);
  expect(isLanguageSettings({ ...initialLanguages[0], date_order: "invalid" })).toBe(false);
  expect(isLanguageSettings({ ...initialLanguages[0], hour_cycle: "invalid" })).toBe(false);
});

test("French admin navigation and the quest editor use the selected language", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("replay-language", JSON.stringify("fr-FR")));
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Parcours", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Leçon", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Retour aux morceaux", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Que voulez-vous jouer aujourd’hui ?" })).toBeVisible();
});

test("an admin manages regional defaults and translations, and readers use US fallback", async ({ page }) => {
  const languages: LanguageSettings[] = [
    ...structuredClone(initialLanguages),
    ...translationLocales.filter(locale => !initialLanguages.some(language => language.locale === locale))
      .map(locale => ({ ...initialLanguages[0], locale })),
  ];
  const strings: Translation[] = [];
  await page.route("**/rest/v1/language_settings**", route => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const locale = new URL(request.url()).searchParams.get("locale")!.slice(3);
      Object.assign(languages.find(row => row.locale === locale)!, request.postDataJSON());
      return route.fulfill({ json: { locale } });
    }
    if (request.method() === "POST") {
      languages.push({ ...initialLanguages[0], locale: request.postDataJSON().locale });
      return route.fulfill({ status: 201 });
    }
    return route.fulfill({ json: languages });
  });
  await page.route("**/rest/v1/language_strings**", route => {
    if (route.request().method() === "POST") {
      strings.push(route.request().postDataJSON());
      return route.fulfill({ status: 201 });
    }
    const code = new URL(route.request().url()).searchParams.get("locale")?.slice(3);
    return route.fulfill({ json: strings.filter(row => row.locale === code) });
  });
  await page.route("**/rest/v1/tune_assets?**", route => route.fulfill({ json: [
    { tune_key: "intro", is_global: true, briefing: { title: "Intro" } },
    { tune_key: "private", is_global: false, briefing: { title: "Account tune" } },
  ] }));
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await page.getByRole("menuitem", { name: "Language Management" }).click();
  for (const code of ["en-US", "fr-FR", "it-IT"]) await expect(page.getByRole("columnheader").filter({ hasText: code })).toBeVisible();
  const target = page.getByRole("combobox", { name: "Translation language" });
  await expect(target).toHaveValue("it-IT");
  for (const code of translationLocales) await expect(target.locator(`option[value="${code}"]`)).toHaveCount(1);
  await page.getByLabel("Search keys or translations").fill("tune.libraryHeading");
  await expect(page.getByRole("button", { name: "tune.libraryHeading it-IT", exact: true })).toHaveText("Che cosa vuoi suonare oggi?");
  await target.selectOption("pl-PL");
  await page.getByLabel("Search keys or translations").fill("library.summary_few");
  await expect(page.getByRole("button", { name: "library.summary_few pl-PL", exact: true })).toBeVisible();
  const saveCell = async (key: string, locale: string, value: string) => {
    await page.getByRole("button", { name: key + " " + locale, exact: true }).click();
    await page.getByRole("textbox", { name: key + " " + locale, exact: true }).fill(value);
    await page.getByRole("button", { name: "Save", exact: true }).last().click();
    await expect(page.getByRole("button", { name: key + " " + locale, exact: true })).toHaveText(value);
  };
  await page.getByLabel("Search keys or translations").fill("tune.libraryHeading");
  await saveCell("tune.libraryHeading","en-US","Pick a piece");
  await page.getByRole("button", { name: "System tune titles" }).click();
  await expect(page.getByRole("rowheader", { name: "private", exact: true })).toHaveCount(0);
  await saveCell("intro","en-US","First steps");
  await page.getByRole("button", { name: "Add language", exact: true }).click();
  await page.getByLabel("Language code").fill("de-AT");
  await page.getByRole("button", { name: "Add language", exact: true }).last().click();
  await expect(target).toHaveValue("de-AT");
  await page.getByLabel("Time format").selectOption("h23");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => languages.find(row => row.locale === "de-AT")?.hour_cycle).toBe("h23");
  await saveCell("intro","de-AT","Erste Schritte");
  await page.getByRole("button", { name: "Back to tunes" }).click();
  await expect(page.getByRole("heading", { name: "Pick a piece" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice: First steps" })).toBeVisible();
  await menu.click();
  await page.getByRole("menuitem", { name: "Language", exact: true }).click();
  await page.getByRole("menuitem", { name: new Intl.DisplayNames(["de-AT"], { type: "language" }).of("de-AT")!, exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de-AT");
  await expect(page.getByRole("heading", { name: "Pick a piece" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice: Erste Schritte" })).toBeVisible();
});

test("non-admins cannot restore or open Language Management", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("replay-active-mode:account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", '"languages"'));
  await page.route("**/rest/v1/user_roles?**", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What would you like to play today?" })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Language Management" })).toHaveCount(0);
});
