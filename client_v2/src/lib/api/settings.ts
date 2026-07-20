import { getJson, postJson } from './http';

// Server settings (/api/v1/setting). Each value is a JSON-encoded string; POST
// takes the raw JSON value for the key.

export interface SettingResponse {
	value: string;
	is_set: boolean;
	type: string;
}

export type SettingsMap = Record<string, SettingResponse>;

export function getSettings(signal?: AbortSignal): Promise<SettingsMap> {
	return getJson<SettingsMap>('/setting/', {}, signal);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	// The endpoint's body param is itself a JSON-encoded string, so the request
	// body must be the value double-encoded (postJson adds the outer encode).
	await postJson(`/setting/${key}`, JSON.stringify(value));
}

/** Parse a SettingResponse's JSON-encoded value, falling back on error. */
export function parseSetting<T>(s: SettingResponse | undefined, fallback: T): T {
	if (!s) return fallback;
	try {
		return JSON.parse(s.value) as T;
	} catch {
		return fallback;
	}
}
