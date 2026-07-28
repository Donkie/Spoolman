import { deleteResource, getJson, postJson } from './http';

// The /api/v1/auth endpoints. Every one of these is reachable without being signed in
// (except changePassword), because they are how a session is obtained in the first
// place. Errors here are handled by the caller rather than by the global 401 handling
// in http.ts — a rejected sign-in is an answer, not a sign-out.

export type Level = 'read' | 'edit' | 'manage';

export interface AuthOidcConfig {
	enabled: boolean;
	name: string | null;
}

export interface AuthConfig {
	enabled: boolean;
	setup_required: boolean;
	anonymous_read: boolean;
	oidc: AuthOidcConfig;
	mtls: boolean;
}

export interface AuthUserInfo {
	id: number;
	username: string;
	display_name: string | null;
	level: Level;
	is_admin: boolean;
	is_owner: boolean;
	is_active: boolean;
	must_change_password: boolean;
}

export interface AuthSessionInfo {
	authenticated: boolean;
	anonymous: boolean;
	level: Level;
	is_admin: boolean;
	is_owner: boolean;
	user: AuthUserInfo | null;
}

export function getAuthConfig(signal?: AbortSignal): Promise<AuthConfig> {
	return getJson<AuthConfig>('/auth/config', {}, signal);
}

export function getAuthSession(signal?: AbortSignal): Promise<AuthSessionInfo> {
	return getJson<AuthSessionInfo>('/auth/session', {}, signal);
}

export function login(username: string, password: string, remember: boolean): Promise<AuthSessionInfo> {
	return postJson<AuthSessionInfo>('/auth/login', { username, password, remember });
}

export function claimInstance(
	username: string,
	password: string,
	displayName?: string
): Promise<AuthSessionInfo> {
	return postJson<AuthSessionInfo>('/auth/setup', {
		username,
		password,
		display_name: displayName || null
	});
}

export function logout(): Promise<{ message: string }> {
	return postJson<{ message: string }>('/auth/logout', {});
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
	return postJson<{ message: string }>('/auth/password', {
		current_password: currentPassword,
		new_password: newPassword
	});
}

// Phase 2: API keys. Every one of these needs a signed-in session — the server
// refuses to let a key manage keys — so unlike the endpoints above, a 401 here really
// does mean the session went away and the global handling in http.ts should run.

export interface ApiKeyInfo {
	id: number;
	name: string;
	level: Level;
	/** What the key can do right now, after capping against its owner's level. */
	effective_level: Level;
	prefix: string;
	created: string;
	expires: string | null;
	last_used: string | null;
	revoked: boolean;
	expired: boolean;
}

export interface ApiKeyCreated {
	/** The complete key. The server returns this once and never again. */
	key: string;
	info: ApiKeyInfo;
}

export function listApiKeys(signal?: AbortSignal): Promise<ApiKeyInfo[]> {
	return getJson<ApiKeyInfo[]>('/auth/apikey', {}, signal);
}

export function createApiKey(name: string, level: Level, expiresDays: number | null): Promise<ApiKeyCreated> {
	return postJson<ApiKeyCreated>('/auth/apikey', {
		name,
		level,
		expires_days: expiresDays
	});
}

export function revokeApiKey(id: number): Promise<ApiKeyInfo> {
	return postJson<ApiKeyInfo>(`/auth/apikey/${id}/revoke`, {});
}

export function deleteApiKey(id: number): Promise<void> {
	return deleteResource(`/auth/apikey/${id}`);
}
