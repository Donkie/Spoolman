import dayjs from "dayjs";
import i18n from "i18next";
import detector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import { getBasePath } from "./utils/url";

interface Language {
  name: string;
  fullCode: string;
  djs: () => Promise<ILocale>;
}

/**
 * List of languages to load
 * The key of each object is the folder name in the locales dir.
 * name: Name of the language in the list
 * fullCode: Full language code, used for Ant Design's locale
 * djs: Function to load the dayjs locale, see https://github.com/iamkun/dayjs/tree/dev/src/locale for list of locales
 */
export const languages: { [key: string]: Language } = {
  ["en"]: {
    name: "English",
    fullCode: "en-GB",
    djs: () => import("dayjs/locale/en"),
  },
  ["sv"]: {
    name: "Svenska",
    fullCode: "sv-SE",
    djs: () => import("dayjs/locale/sv"),
  },
  ["de"]: {
    name: "Deutsch",
    fullCode: "de-DE",
    djs: () => import("dayjs/locale/de"),
  },
  ["es"]: {
    name: "Español",
    fullCode: "es-ES",
    djs: () => import("dayjs/locale/es"),
  },
  ["zh"]: {
    name: "简体中文",
    fullCode: "zh-CN",
    djs: () => import("dayjs/locale/zh-cn"),
  },
  ["zh-Hant"]: {
    name: "繁體中文",
    fullCode: "zh-TW",
    djs: () => import("dayjs/locale/zh-hk"),
  },
  ["pl"]: {
    name: "Polski",
    fullCode: "pl-PL",
    djs: () => import("dayjs/locale/pl"),
  },
  ["ru"]: {
    name: "Русский",
    fullCode: "ru-RU",
    djs: () => import("dayjs/locale/ru"),
  },
  ["cs"]: {
    name: "Česky",
    fullCode: "cs-CZ",
    djs: () => import("dayjs/locale/cs"),
  },
  ["nb-NO"]: {
    name: "Norsk bokmål",
    fullCode: "nb-NO",
    djs: () => import("dayjs/locale/nb"),
  },
  ["nl"]: {
    name: "Nederlands",
    fullCode: "nl-NL",
    djs: () => import("dayjs/locale/nl"),
  },
  ["fr"]: {
    name: "Français",
    fullCode: "fr-FR",
    djs: () => import("dayjs/locale/fr"),
  },
  ["hu"]: {
    name: "Magyar",
    fullCode: "hu-HU",
    djs: () => import("dayjs/locale/hu"),
  },
  ["it"]: {
    name: "Italiano",
    fullCode: "it-IT",
    djs: () => import("dayjs/locale/it"),
  },
  ["uk"]: {
    name: "Українська",
    fullCode: "uk-UA",
    djs: () => import("dayjs/locale/uk"),
  },
  ["el"]: {
    name: "Ελληνικά",
    fullCode: "el-GR",
    djs: () => import("dayjs/locale/el"),
  },
  ["da"]: {
    name: "Dansk",
    fullCode: "da-DK",
    djs: () => import("dayjs/locale/da"),
  },
  ["pt"]: {
    name: "Português",
    fullCode: "pt-PT",
    djs: () => import("dayjs/locale/pt"),
  },
  ["fa"]: {
    name: "فارسی",
    fullCode: "fa-IR",
    djs: () => import("dayjs/locale/fa"),
  },
  ["ro"]: {
    name: "Român",
    fullCode: "ro-RO",
    djs: () => import("dayjs/locale/ro"),
  },
  ["ja"]: {
    name: "日本語",
    fullCode: "ja-JP",
    djs: () => import("dayjs/locale/ja"),
  },
  ["pt-BR"]: {
    name: "Português (Brasil)",
    fullCode: "pt-BR",
    djs: () => import("dayjs/locale/pt-br"),
  },
  ["ta"]: {
    name: "தமிழ்",
    fullCode: "ta-IN",
    djs: () => import("dayjs/locale/ta"),
  },
  ["th"]: {
    name: "ไทย",
    fullCode: "th-TH",
    djs: () => import("dayjs/locale/th"),
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

i18n.on("languageChanged", function (lng) {
  languages[lng].djs().then((djs) => dayjs.locale(djs.name));
});

export default i18n;
