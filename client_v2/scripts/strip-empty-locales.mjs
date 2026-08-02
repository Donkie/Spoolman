#!/usr/bin/env node
// Strip empty translation values from the non-base locale files before paraglide
// compiles them.
//
//   node scripts/strip-empty-locales.mjs [--check]
//
// Why this exists
// ---------------
// Weblate writes an *empty string* for every key a translator hasn't filled in
// yet. Paraglide (via plugin-i18next) treats an empty string as a real, present
// translation: it compiles a message function that returns "" for that locale,
// so the site renders a blank instead of falling back to English. A key that is
// *absent* from a locale file, on the other hand, is re-exported from the base
// locale (`export { key } from "./en.js"`) and falls back correctly.
//
// So the fix is simply to delete empty (or whitespace-only) leaves from every
// non-base locale before compilation. This is a mechanical data-cleaning pass,
// not translation — it never invents or edits a real translation, it only drops
// the placeholder empties Weblate leaves behind. The base locale (en) is the
// source of truth and is left untouched.
//
// It runs automatically before `dev` and `build` (see package.json), so the
// compiled output is always correct even if empties reappear (e.g. from a future
// Weblate sync). Empties are a benign, expected input here — they're neutralised,
// not forbidden — so this is deliberately NOT a CI gate that would block partial
// translations. Pass `--check` for a read-only diagnostic that makes no changes
// and exits non-zero if any empty leaves remain.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SETTINGS = join(ROOT, 'project.inlang', 'settings.json');

const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
const baseLocale = settings.baseLocale;
const locales = settings.locales ?? [];
// e.g. "./locales/{locale}/common.json"
const pathPattern = settings['plugin.inlang.i18next']?.pathPattern ?? './locales/{locale}/common.json';

const isEmpty = (v) => typeof v === 'string' && v.trim() === '';

/**
 * Recursively drop empty string leaves and any object left empty as a result.
 * Returns { value, removed }. Handles both the flat dotted-key files used today
 * and nested objects, so it stays correct if the layout ever changes.
 */
function strip(node) {
	if (Array.isArray(node) || node === null || typeof node !== 'object') {
		return { value: node, removed: 0 };
	}
	const out = {};
	let removed = 0;
	for (const [key, value] of Object.entries(node)) {
		if (isEmpty(value)) {
			removed++;
			continue;
		}
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const res = strip(value);
			removed += res.removed;
			// Drop objects that became empty once their empty leaves were removed.
			if (Object.keys(res.value).length === 0) continue;
			out[key] = res.value;
		} else {
			out[key] = value;
		}
	}
	return { value: out, removed };
}

const checkMode = process.argv.includes('--check');

let totalRemoved = 0;
const offenders = [];

for (const locale of locales) {
	if (locale === baseLocale) continue;
	const file = join(ROOT, pathPattern.replace('{locale}', locale));
	let raw;
	try {
		raw = readFileSync(file, 'utf8');
	} catch {
		continue; // locale declared but no file on disk yet — nothing to strip.
	}
	const { value, removed } = strip(JSON.parse(raw));
	if (removed === 0) continue;
	totalRemoved += removed;
	if (checkMode) {
		offenders.push(`${locale}: ${removed} empty value(s)`);
		continue;
	}
	// Match the existing formatting: 4-space indent, trailing newline. Key order
	// is preserved because JSON.stringify walks own-property insertion order.
	writeFileSync(file, JSON.stringify(value, null, 4) + '\n', 'utf8');
	console.log(`stripped ${removed} empty value(s) from ${locale}`);
}

if (checkMode) {
	if (offenders.length) {
		console.error('Empty translation values found (run `node scripts/strip-empty-locales.mjs`):');
		for (const line of offenders) console.error(`  ${line}`);
		process.exit(1);
	}
	console.log('No empty translation values found.');
} else {
	console.log(
		totalRemoved === 0
			? 'No empty translation values to strip.'
			: `Stripped ${totalRemoved} empty value(s) total.`
	);
}
