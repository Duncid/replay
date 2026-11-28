import type { Tables } from "@/integrations/supabase/types";
import en from "@/locales/en/common.json" with { type: "json" };
import fr from "@/locales/fr/common.json" with { type: "json" };

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
export const initialLanguages: LanguageSettings[] = [
  { locale: US, notation: "abc", date_order: "MDY", hour_cycle: "h12" },
  { locale: "en-GB", notation: "abc", date_order: "DMY", hour_cycle: "h23" },
  { locale: "fr-FR", notation: "solfege", date_order: "DMY", hour_cycle: "h23" },
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
export const bundledStrings: Record<string, Record<string, string>> = {
  [US]: Object.fromEntries(flatten(en)),
  "fr-FR": Object.fromEntries(flatten(fr)),
};
export const stringKeys = [...new Set(Object.values(bundledStrings).flatMap(Object.keys))].sort();

export function formatDateTime(date: Date, settings: LanguageSettings) {
  const parts = new Intl.DateTimeFormat(settings.locale, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  const order = { MDY: ["month","day","year"], DMY: ["day","month","year"], YMD: ["year","month","day"] }[settings.date_order];
  const time = new Intl.DateTimeFormat(settings.locale, { hour: "numeric", minute: "2-digit", hourCycle: settings.hour_cycle }).format(date);
  return order.map(part).join(settings.date_order === "YMD" ? "-" : "/") + ", " + time;
}
