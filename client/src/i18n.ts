import i18n from "i18next";
import detector from "i18next-browser-languagedetector";
import Backend from "i18next-xhr-backend";
import { initReactI18next } from "react-i18next";

interface Language {
  name: string;
  countryCode: string;
  fullCode: string;
}

export const languages: { [key: string]: Language } = {
  ["en"]: {
    name: "English",
    countryCode: "gb",
    fullCode: "en-GB",
  },
  ["sv"]: {
    name: "Svenska",
    countryCode: "se",
    fullCode: "sv-SE",
  },
  ["de"]: {
    name: "Deutsch",
    countryCode: "de",
    fullCode: "de-DE",
  },
}

i18n
  .use(Backend)
  .use(detector)
  .use(initReactI18next)
  .init({
    supportedLngs: Object.keys(languages),
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    defaultNS: "common",
    fallbackLng: "en",
  });

export default i18n;
