import type { Tables } from "@/integrations/supabase/types";
import en from "@/locales/en/common.json" with { type: "json" };
import fr from "@/locales/fr/common.json" with { type: "json" };
import it from "@/locales/it/common.json" with { type: "json" };
import itTunes from "@/locales/it/tunes.json" with { type: "json" };

export type LanguageSettings = Omit<Tables<"language_settings">, "notation" | "date_order" | "hour_cycle"> & {
  notation: "abc" | "solfege";
  date_order: "MDY" | "DMY" | "YMD";
  hour_cycle: "h12" | "h23";
};
export function isLanguageSettings(row: Tables<"language_settings">): row is LanguageSettings {
  return (row.notation === "abc" || row.notation === "solfege")
    && (row.date_order === "MDY" || row.date_order === "DMY" || row.date_order === "YMD")
    && (row.hour_cycle === "h12" || row.hour_cycle === "h23");
}
export type Translation = Tables<"language_strings">;
export const US = "en-US";
export const FR = "fr-FR";
export const sourceLocales = [US, FR] as const;
export const defaultTranslationLocale = "it-IT";
export const translationLocales = [
  defaultTranslationLocale, "es-419", "pt-BR", "de-DE", "nl-NL", "sv-SE",
  "pl-PL", "cs-CZ", "hu-HU", "ro-RO",
] as const;
export const initialLanguages: LanguageSettings[] = [
  { locale: US, notation: "abc", date_order: "MDY", hour_cycle: "h12" },
  { locale: "en-GB", notation: "abc", date_order: "DMY", hour_cycle: "h23" },
  { locale: FR, notation: "solfege", date_order: "DMY", hour_cycle: "h23" },
  { locale: defaultTranslationLocale, notation: "solfege", date_order: "DMY", hour_cycle: "h23" },
];

export function normalizeLocale(code: string) {
  if (code === "en") return US;
  if (code === "fr") return "fr-FR";
  try { return Intl.getCanonicalLocales(code)[0] || US; } catch { return US; }
}

export function languageName(code: string) {
  return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
}

function flatten(group: object, prefix = ""): [string, string][] {
  return Object.entries(group).flatMap(([key, value]) => {
    const path = prefix ? prefix + "." + key : key;
    return typeof value === "string" ? [[path, value] as [string, string]] : flatten(value, path);
  });
}
export const bundledResources: Record<string, object> = {
  [US]: en,
  [FR]: fr,
  [defaultTranslationLocale]: it,
};
export const bundledTuneTitles: Record<string, Record<string, string>> = {
  [defaultTranslationLocale]: itTunes,
};
export const bundledStrings: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(bundledResources).map(([locale, common]) => [locale, Object.fromEntries(flatten(common))]),
);
const stringKeys = [...new Set(sourceLocales.flatMap(locale => Object.keys(bundledStrings[locale])))].sort();
const sourceKeys = new Set(stringKeys);
const extraPlural = /_(zero|two|few|many)$/;

export function sourceKeyFor(key: string) {
  if (sourceKeys.has(key)) return key;
  const pluralSource = key.replace(extraPlural, "_other");
  return sourceKeys.has(pluralSource) ? pluralSource : undefined;
}

export function translationKeys(locale: string) {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  return stringKeys.flatMap(key => key.endsWith("_other")
    ? [...new Set([key, ...categories.filter(category => category !== "one").map(category => key.replace(/_other$/, "_" + category))])]
    : [key]);
}

export function formatDateTime(date: Date, settings: LanguageSettings) {
  const parts = new Intl.DateTimeFormat(settings.locale, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  const order = { MDY: ["month","day","year"], DMY: ["day","month","year"], YMD: ["year","month","day"] }[settings.date_order];
  const time = new Intl.DateTimeFormat(settings.locale, { hour: "numeric", minute: "2-digit", hourCycle: settings.hour_cycle }).format(date);
  return order.map(part).join(settings.date_order === "YMD" ? "-" : "/") + ", " + time;
}
