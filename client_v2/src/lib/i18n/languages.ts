// The languages offered in the client_v2 language picker. Keys are the file
// names under messages. `name` is the
// endonym shown in the picker; `code` is the BCP-47 tag used for Intl
// date/number formatting.

export interface LanguageMeta {
	name: string;
	code: string;
}

export const languages: Record<string, LanguageMeta> = {
	en: { name: 'English', code: 'en-GB' },
	sv: { name: 'Svenska', code: 'sv-SE' },
	de: { name: 'Deutsch', code: 'de-DE' },
	es: { name: 'Español', code: 'es-ES' },
	zh: { name: '简体中文', code: 'zh-CN' },
	'zh-Hant': { name: '繁體中文', code: 'zh-TW' },
	pl: { name: 'Polski', code: 'pl-PL' },
	ru: { name: 'Русский', code: 'ru-RU' },
	cs: { name: 'Česky', code: 'cs-CZ' },
	'nb-NO': { name: 'Norsk bokmål', code: 'nb-NO' },
	nl: { name: 'Nederlands', code: 'nl-NL' },
	fr: { name: 'Français', code: 'fr-FR' },
	hu: { name: 'Magyar', code: 'hu-HU' },
	it: { name: 'Italiano', code: 'it-IT' },
	uk: { name: 'Українська', code: 'uk-UA' },
	el: { name: 'Ελληνικά', code: 'el-GR' },
	da: { name: 'Dansk', code: 'da-DK' },
	pt: { name: 'Português', code: 'pt-PT' },
	fa: { name: 'فارسی', code: 'fa-IR' },
	ro: { name: 'Român', code: 'ro-RO' },
	ja: { name: '日本語', code: 'ja-JP' },
	'pt-BR': { name: 'Português (Brasil)', code: 'pt-BR' },
	ta: { name: 'தமிழ்', code: 'ta-IN' },
	th: { name: 'ไทย', code: 'th-TH' },
	lt: { name: 'Lietuvių', code: 'lt-LT' },
	tr: { name: 'Türkçe', code: 'tr-TR' }
};

export const languageCodes = Object.keys(languages);

export const DEFAULT_LOCALE = 'en';
