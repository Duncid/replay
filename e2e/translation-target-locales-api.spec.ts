import { test, expect } from "@playwright/test";
import { loadEnv } from "vite";

// Opt-in integration checks: these read the real API and never modify language data.
test.skip(process.env.VERIFY_LIVE_LANGUAGE_API !== "1", "Requires live language API verification");

const env = loadEnv("development", process.cwd(), "VITE_");
const expectedSettings = [
  { locale: "it-IT", notation: "solfege", date_order: "DMY", hour_cycle: "h23" },
  { locale: "es-419", notation: "solfege", date_order: "DMY", hour_cycle: "h12" },
  { locale: "pt-BR", notation: "solfege", date_order: "DMY", hour_cycle: "h23" },
  { locale: "de-DE", notation: "abc", date_order: "DMY", hour_cycle: "h23" },
  { locale: "nl-NL", notation: "abc", date_order: "DMY", hour_cycle: "h23" },
  { locale: "sv-SE", notation: "abc", date_order: "YMD", hour_cycle: "h23" },
  { locale: "pl-PL", notation: "abc", date_order: "DMY", hour_cycle: "h23" },
  { locale: "cs-CZ", notation: "abc", date_order: "DMY", hour_cycle: "h23" },
  { locale: "hu-HU", notation: "abc", date_order: "YMD", hour_cycle: "h23" },
  { locale: "ro-RO", notation: "solfege", date_order: "DMY", hour_cycle: "h23" },
] as const;

function apiHeaders() {
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!env.VITE_SUPABASE_URL || !key) throw new Error("Live API configuration is missing");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

for (const expected of expectedSettings) {
  test(`live API exposes selected locale ${expected.locale} with its formatting defaults`, async ({ request }) => {
    const response = await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/language_settings`, {
      headers: apiHeaders(),
      params: { select: "locale,notation,date_order,hour_cycle", locale: `eq.${expected.locale}` },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([expected]);
  });
}

test("live API retains original locales and exposes language strings", async ({ request }) => {
  const settings = await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/language_settings`, {
    headers: apiHeaders(), params: { select: "locale", order: "locale" },
  });
  expect(settings.status()).toBe(200);
  expect(await settings.json()).toEqual(expect.arrayContaining([
    { locale: "en-US" }, { locale: "en-GB" }, { locale: "fr-FR" },
  ]));
  const strings = await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/language_strings`, {
    headers: apiHeaders(), params: { select: "locale", limit: "1" },
  });
  expect(strings.status()).toBe(200);
  expect(Array.isArray(await strings.json())).toBe(true);
});