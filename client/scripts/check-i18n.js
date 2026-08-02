#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import process from "process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCALES_DIR = join(__dirname, "../public/locales");
const I18N_FILE = join(__dirname, "../src/i18n.ts");
const REFERENCE_LOCALE = "en";
const MIN_TRANSLATED_RATIO = 0.5; // A locale must be at least 50% translated to be included

/**
 * Recursively collect all leaf values of a translation object, keyed by their
 * dotted path. Only string leaves are considered translatable.
 */
function collectLeaves(obj, prefix, out) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      collectLeaves(value, path, out);
    } else if (typeof value === "string") {
      out[path] = value;
    }
  }
  return out;
}

function loadLocale(locale) {
  const commonFilePath = join(LOCALES_DIR, locale, "common.json");
  return collectLeaves(JSON.parse(readFileSync(commonFilePath, "utf8")), "", {});
}

/**
 * Ratio of keys in `locale` that are present, non-empty, and different from the
 * English reference. Missing keys and untranslated (identical) strings count as
 * not translated.
 */
function translatedRatio(reference, locale) {
  const refKeys = Object.keys(reference);
  if (refKeys.length === 0) return 0;
  let translated = 0;
  for (const key of refKeys) {
    const value = locale[key];
    if (typeof value === "string" && value.trim() !== "" && value !== reference[key]) {
      translated++;
    }
  }
  return translated / refKeys.length;
}

function getLocaleFolders() {
  return readdirSync(LOCALES_DIR).filter((folder) => {
    const folderPath = join(LOCALES_DIR, folder);
    const commonFilePath = join(folderPath, "common.json");
    return statSync(folderPath).isDirectory() && statSync(commonFilePath, { throwIfNoEntry: false })?.isFile();
  });
}

function getDeclaredLanguages() {
  const i18nContent = readFileSync(I18N_FILE, "utf8");
  const languageMatches = [...i18nContent.matchAll(/\["(.*?)"\]:/g)];
  return languageMatches.map((match) => match[1]);
}

function main() {
  const reference = loadLocale(REFERENCE_LOCALE);
  const declaredLocales = new Set(getDeclaredLanguages());

  // Locales that are sufficiently translated but not yet declared in i18n.ts
  const missingLocales = [];
  for (const locale of getLocaleFolders()) {
    if (locale === REFERENCE_LOCALE || declaredLocales.has(locale)) continue;
    const ratio = translatedRatio(reference, loadLocale(locale));
    if (ratio >= MIN_TRANSLATED_RATIO) {
      missingLocales.push({ locale, ratio });
    }
  }

  if (missingLocales.length > 0) {
    console.error("❌ The following locales are at least 50% translated but missing from src/i18n.ts:");
    missingLocales.forEach(({ locale, ratio }) =>
      console.error(`  - ${locale} (${Math.round(ratio * 100)}% translated)`),
    );
    console.error("⚠️  Please add them to the `languages` object in i18n.ts.");
    console.log("Template:");
    for (const { locale } of missingLocales) {
      console.log(`["${locale}"]: {
  name: "",
  fullCode: "",
  djs: () => import("dayjs/locale/${locale.toLowerCase()}"),
},`);
    }
    process.exit(1);
  }

  console.log("✅ All sufficiently translated locales are declared in i18n.ts.");
  process.exit(0);
}

main();
