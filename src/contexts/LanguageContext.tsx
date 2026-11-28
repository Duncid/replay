import { updateLocalizedMetadata } from "@/lib/localizedMetadata";
import { useAuth } from "@/contexts/AuthContext";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { translationsQuery, useLanguages } from "@/hooks/useLanguages";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { US, bundledResources, bundledTuneTitles, initialLanguages, normalizeLocale, sourceKeyFor, type LanguageSettings, type Translation } from "@/lib/languages";
import i18n from "@/lib/i18n";

const context = createContext({
  settings: initialLanguages[0], languages: initialLanguages,
  setLanguage: (_locale: string) => {},
  systemTitle: (_key: string, original: string) => original,
});
export const useLanguage = () => useContext(context);

function installStrings(locale: string, rows?: Translation[]) {
  // Rebuild from the shipped catalogue so clearing an override also restores arrays and plurals.
  i18n.removeResourceBundle(locale, "common");
  i18n.addResourceBundle(locale, "common", structuredClone(bundledResources[locale] ?? {}));
  for (const row of rows ?? []) {
    if (row.kind === "ui" && sourceKeyFor(row.key)) i18n.addResource(locale, "common", row.key, row.value);
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <ActiveLanguage key={user?.id ?? "guest"}>{children}</ActiveLanguage>;
}

function ActiveLanguage({ children }: { children: ReactNode }) {
  const [stored, setLanguage] = useLocalStorage<string>(STORAGE_KEYS.LANGUAGE, US);
  const selected = normalizeLocale(stored);
  const { data: languages = initialLanguages } = useLanguages();
  const settings: LanguageSettings = languages.find(item => item.locale === selected) ?? languages[0];
  const locale = settings.locale;
  const { data: us } = useQuery(translationsQuery(US));
  const { data: current } = useQuery(translationsQuery(locale));
  useEffect(() => {
    installStrings(US, us);
    if (locale !== US) installStrings(locale, current);
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
    const t = i18n.getFixedT(locale);
    updateLocalizedMetadata(locale, t("landing.description"), t("landing.socialImage"));
  }, [locale, us, current]);

  const systemTitle = useMemo(() => {
    const titles = new Map<string, string>();
    for (const row of us ?? []) {
      if (row.kind === "tune") titles.set(row.key, row.value);
    }
    for (const [key, value] of Object.entries(bundledTuneTitles[locale] ?? {})) titles.set(key, value);
    for (const row of current ?? []) {
      if (row.kind === "tune") titles.set(row.key, row.value);
    }
    return (key: string, original: string) => titles.get(key) ?? original;
  }, [locale, us, current]);
  return <context.Provider value={{ languages, settings, setLanguage, systemTitle }}>{children}</context.Provider>;
}
