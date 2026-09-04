import { gzipSync, strToU8 } from 'fflate';
import type { Filament, Spool, Vendor } from '$lib/types';

export const OPEN_SPOOL_PROFILE_EXTRA_KEY = 'openspool_profile';
export const OPEN_SPOOL_QR_PREFIX = 'OSQ1:';

const COLOR_PATTERN = /^#[0-9A-F]{6}$/;

export interface OpenSpoolProfile {
	schema_version: '1';
	brand: string;
	name: string;
	type: string;
	subtype?: string;
	color_name?: string;
	color_hex: string;
	additional_color_hexes?: string[];
	diameter_mm?: number;
	nozzle_temp_min_c?: number;
	nozzle_temp_max_c?: number;
	bed_temp_min_c?: number;
	bed_temp_max_c?: number;
	weight_g?: number;
	source_url?: string;
}

export interface OpenSpoolProfileContext {
	spool: Spool;
	filament: Filament;
	vendor?: Vendor;
}

interface OpenSpoolEnvelope {
	format: 'openspool-qr';
	version: 1;
	profile: OpenSpoolProfile;
}

function decodeExtraValue(value: string | undefined): unknown {
	let decoded: unknown = value;
	for (let attempt = 0; attempt < 2 && typeof decoded === 'string'; attempt += 1) {
		try {
			decoded = JSON.parse(decoded);
		} catch {
			break;
		}
	}
	return decoded;
}

function extraText(extra: Record<string, string>, key: string): string | undefined {
	const decoded = decodeExtraValue(extra[key]);
	if (typeof decoded !== 'string') return undefined;
	const text = decoded.trim();
	return text || undefined;
}

function profileOverride(filament: Filament): Partial<OpenSpoolProfile> | undefined {
	const decoded = decodeExtraValue(filament.extra[OPEN_SPOOL_PROFILE_EXTRA_KEY]);
	if (decoded == null) return undefined;
	if (typeof decoded !== 'object' || Array.isArray(decoded)) {
		throw new Error(`${OPEN_SPOOL_PROFILE_EXTRA_KEY} must contain a JSON object`);
	}
	return decoded as Partial<OpenSpoolProfile>;
}

function color(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const hex = value.trim().replace(/^#/, '').toUpperCase();
	return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : undefined;
}

function text(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function positiveNumber(value: unknown): number | undefined {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) && number > 0 ? number : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	const number = positiveNumber(value);
	return number == null ? undefined : Math.round(number);
}

function overrideColors(value: unknown): string[] | undefined {
	if (value == null) return undefined;
	if (!Array.isArray(value)) throw new Error('additional_color_hexes must be an array');
	return value.map((entry) => color(entry) ?? String(entry));
}

/**
 * Build the self-contained profile transported to the NFC writer.
 *
 * Spoolman only has one nozzle and bed temperature, so those map to maximums;
 * missing minimums are deliberately omitted. Installations that need the full
 * manufacturer profile can store it as JSON in the filament text extra field
 * `openspool_profile`. Values in that object override the mapped fields.
 */
export function buildOpenSpoolProfile({
	spool,
	filament,
	vendor
}: OpenSpoolProfileContext): OpenSpoolProfile {
	const override = profileOverride(filament);
	const mappedColors = filament.colors.map(color).filter((entry): entry is string => entry != null);
	const additionalOverride = overrideColors(override?.additional_color_hexes);

	const profileWithEmptyValues: OpenSpoolProfile = {
		schema_version: '1',
		brand: text(override?.brand) ?? vendor?.name.trim() ?? '',
		name: text(override?.name) ?? filament.name.trim(),
		type: text(override?.type) ?? filament.material.trim(),
		subtype: text(override?.subtype) ?? extraText(filament.extra, 'variant'),
		color_name: text(override?.color_name),
		color_hex: color(override?.color_hex) ?? mappedColors[0] ?? '',
		additional_color_hexes:
			additionalOverride ?? (mappedColors.length > 1 ? mappedColors.slice(1) : undefined),
		diameter_mm: positiveNumber(override?.diameter_mm) ?? positiveNumber(filament.diameter),
		nozzle_temp_min_c: positiveInteger(override?.nozzle_temp_min_c),
		nozzle_temp_max_c: positiveInteger(override?.nozzle_temp_max_c) ?? positiveInteger(filament.nozzleTemp),
		bed_temp_min_c: positiveInteger(override?.bed_temp_min_c),
		bed_temp_max_c: positiveInteger(override?.bed_temp_max_c) ?? positiveInteger(filament.bedTemp),
		weight_g: positiveInteger(override?.weight_g) ?? positiveInteger(spool.initial),
		source_url: text(override?.source_url)
	};

	// Optional fields that Spoolman does not know must stay absent from the QR,
	// instead of being serialized as nulls or made-up defaults.
	const profile = Object.fromEntries(
		Object.entries(profileWithEmptyValues).filter(([, value]) => value != null && value !== '')
	) as unknown as OpenSpoolProfile;
	validateOpenSpoolProfile(profile);
	return profile;
}

export function validateOpenSpoolProfile(profile: OpenSpoolProfile): void {
	if (!profile.brand) throw new Error('OpenSpool profile has no brand');
	if (!profile.name) throw new Error('OpenSpool profile has no name');
	if (!profile.type) throw new Error('OpenSpool profile has no material type');
	if (!COLOR_PATTERN.test(profile.color_hex)) throw new Error('OpenSpool profile has no valid color');

	const additional = profile.additional_color_hexes ?? [];
	if (additional.length > 4) throw new Error('OpenSpool supports at most four additional colors');
	if (additional.some((entry) => !COLOR_PATTERN.test(entry))) {
		throw new Error('OpenSpool profile has an invalid additional color');
	}

	if (
		profile.nozzle_temp_min_c != null &&
		profile.nozzle_temp_max_c != null &&
		profile.nozzle_temp_min_c > profile.nozzle_temp_max_c
	) {
		throw new Error('OpenSpool nozzle temperature range is invalid');
	}
	if (
		profile.bed_temp_min_c != null &&
		profile.bed_temp_max_c != null &&
		profile.bed_temp_min_c > profile.bed_temp_max_c
	) {
		throw new Error('OpenSpool bed temperature range is invalid');
	}
}

function base64Url(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function encodeOpenSpoolQr(profile: OpenSpoolProfile): string {
	validateOpenSpoolProfile(profile);
	const envelope: OpenSpoolEnvelope = {
		format: 'openspool-qr',
		version: 1,
		profile: { ...profile, schema_version: '1' }
	};
	const compressed = gzipSync(strToU8(JSON.stringify(envelope)), { level: 9 });
	return `${OPEN_SPOOL_QR_PREFIX}${base64Url(compressed)}`;
}
