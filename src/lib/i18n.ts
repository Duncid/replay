import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "@/locales/en/common.json";
import frCommon from "@/locales/fr/common.json";

export const bundledResources: Record<string, object> = { "en-US": enCommon, "fr-FR": frCommon };
const resources = Object.fromEntries(Object.entries(bundledResources).map(([locale, common]) => [locale, { common }]));

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: "en-US",
    load: "currentOnly",
    fallbackLng: "en-US",
    interpolation: {
      escapeValue: false,
    },
    defaultNS: "common",
  });
}

export default i18n;
