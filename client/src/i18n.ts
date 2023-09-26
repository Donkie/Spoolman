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
  ["es"]: {
    name: "Español",
    countryCode: "es",
    fullCode: "es-ES",
  },
  ["zh"]: {
    name: "简体中文",
    countryCode: "cn",
    fullCode: "zh-CN",
  },
  ["pl"]: {
    name: "Polski",
    countryCode: "pl",
    fullCode: "pl-PL",
  },
  ["ru"]: {
    name: "Русский",
    countryCode: "ru",
    fullCode: "ru-RU",
  },
  ["cs"]: {
    name: "Česky",
    countryCode: "cs",
    fullCode: "cs-CS",
  },
  ["nb-NO"]: {
    name: "Norsk bokmål",
    countryCode: "no",
    fullCode: "nb-NO",
  },
  ["nl"]: {
    name: "Nederlands",
    countryCode: "nl",
    fullCode: "nl-NL",
  },
  ["fr"]: {
    name: "Français",
    countryCode: "fr",
    fullCode: "fr-FR",
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
