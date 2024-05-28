import i18n from "i18next";
import detector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import { getBasePath } from "./utils/url";

interface Language {
  name: string;
  countryCode: string;
  fullCode: string;
}

/**
 * List of languages to load
 * The key of each object is the folder name in the locales dir.
 * name: Name of the language in the list
 * countryCode: Country code of the country's flag to display for this language
 * fullCode: Full language code, used for Ant Design's locale
 */
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
    countryCode: "cz",
    fullCode: "cs-CZ",
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
  ["hu"]: {
    name: "Magyar",
    countryCode: "hu",
    fullCode: "hu-HU",
  },
  ["it"]: {
    name: "Italiano",
    countryCode: "it",
    fullCode: "it-IT",
  },
  ["uk"]: {
    name: "Українська",
    countryCode: "ua",
    fullCode: "uk-UA",
  },
  ["el"]: {
    name: "Ελληνικά",
    countryCode: "gr",
    fullCode: "el-GR",
  },
  ["da"]: {
    name: "Dansk",
    countryCode: "dk",
    fullCode: "da-DK",
  },
  ["pt"]: {
    name: "Português",
    countryCode: "pt",
    fullCode: "pt-PT",
  },
};

i18n
  .use(Backend)
  .use(detector)
  .use(initReactI18next)
  .init({
    supportedLngs: Object.keys(languages),
    backend: {
      loadPath: getBasePath() + "/locales/{{lng}}/{{ns}}.json",
    },
    ns: "common",
    defaultNS: "common",
    fallbackLng: "en",
  });

export default i18n;
