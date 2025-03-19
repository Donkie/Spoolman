#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCALES_DIR = join(__dirname, "../public/locales");
const I18N_FILE = join(__dirname, "../src/i18n.ts");

const minLocaleFileSize = 1024 * 10; // Minimum 10kB for a locale file to be considered
function getLocaleFolders() {
  return readdirSync(LOCALES_DIR).filter((folder) => {
    const folderPath = join(LOCALES_DIR, folder);
    const commonFilePath = join(folderPath, "common.json");
    return (
      statSync(folderPath).isDirectory() &&
      statSync(commonFilePath).isFile() &&
      statSync(commonFilePath).size >= minLocaleFileSize
    );
  });
}

function getDeclaredLanguages() {
  const i18nContent = readFileSync(I18N_FILE, "utf8");
  const languageMatches = [...i18nContent.matchAll(/\["(.*?)"\]:/g)];
  return languageMatches.map((match) => match[1]);
}

function main() {
  const foundLocales = new Set(getLocaleFolders());
  const declaredLocales = new Set(getDeclaredLanguages());

  const missingLocales = [...foundLocales].filter((locale) => !declaredLocales.has(locale));

  if (missingLocales.length > 0) {
    console.error("❌ The following locales are missing from src/i18n.ts:");
    missingLocales.forEach((locale) => console.error(`  - ${locale}`));
    console.error("⚠️  Please add them to the `languages` object in i18n.ts.");
    console.log("Template:");
    for (const locale of missingLocales) {
      console.log(`["${locale}"]: {
  name: "",
  fullCode: "",
  djs: () => import("dayjs/locale/${locale.toLowerCase()}"),
},`);
    }
    process.exit(1);
  }

  console.log("✅ All locales are properly declared in i18n.ts.");
  process.exit(0);
}

main();
