import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { bundledResources, US } from "./languages";

const resources = Object.fromEntries(Object.entries(bundledResources).map(([locale, common]) => [locale, { common }]));

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: US,
    load: "currentOnly",
    fallbackLng: US,
    interpolation: {
      escapeValue: false,
    },
    defaultNS: "common",
  });
}

export default i18n;
