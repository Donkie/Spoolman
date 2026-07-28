import { deleteJson, getJson, getList, patchJson, postJson } from './http';
import type { AuthUserInfo, Level } from './auth';

// The administrator-only endpoints: /auth/user and /auth/audit. Everything here is
// refused with 403 unless the caller is signed in as an administrator, so views built
// on these must gate themselves on `auth.isAdmin` — not to enforce anything, but to
// avoid rendering a page whose every request will fail.

export interface UserCreated {
	user: AuthUserInfo;
	/** Present only when the server generated the password. Shown once. */
	password?: string;
}

export interface UserCreateInput {
	username: string;
	password?: string | null;
	display_name?: string | null;
	level: Level;
	is_admin: boolean;
	must_change_password: boolean;
}

export interface UserUpdateInput {
	display_name?: string | null;
	level?: Level;
	is_admin?: boolean;
	is_active?: boolean;
}

/** Users, plus the total the server reports — which may exceed what was returned. */
export async function listUsers(signal?: AbortSignal): Promise<AuthUserInfo[]> {
	const page = await getList('/auth/user', {}, signal);
	return page.items as AuthUserInfo[];
}

export function createUser(input: UserCreateInput): Promise<UserCreated> {
	return postJson<UserCreated>('/auth/user', input);
}

export function updateUser(id: number, input: UserUpdateInput): Promise<AuthUserInfo> {
	return patchJson<AuthUserInfo>(`/auth/user/${id}`, input);
}

export function resetUserPassword(
	id: number,
	password: string | null,
	mustChangePassword: boolean
): Promise<UserCreated> {
	return postJson<UserCreated>(`/auth/user/${id}/password`, {
		password,
		must_change_password: mustChangePassword
	});
}

export function revokeUserSessions(id: number): Promise<{ message: string }> {
	return postJson<{ message: string }>(`/auth/user/${id}/revoke-sessions`, {});
}

export function deleteUser(id: number): Promise<{ message: string }> {
	return deleteJson<{ message: string }>(`/auth/user/${id}`);
}

export interface AuditEntry {
	id: number;
	date: string;
	event: string;
	actor_user_id: number | null;
	actor_username: string | null;
	actor_kind: string;
	target: string | null;
	ip: string | null;
	user_agent: string | null;
	detail: Record<string, unknown> | null;
}

export interface AuditPage {
	entries: AuditEntry[];
	total: number;
}

export async function listAudit(
	params: { limit: number; offset: number; event?: string },
	signal?: AbortSignal
): Promise<AuditPage> {
	// getList rather than getJson: the endpoint reports the unpaginated total in
	// X-Total-Count, which is what drives the pager.
	const page = await getList(
		'/auth/audit',
		{ limit: params.limit, offset: params.offset, event: params.event || undefined },
		signal
	);
	return { entries: page.items as AuditEntry[], total: page.total };
}

export function listAuditEvents(signal?: AbortSignal): Promise<string[]> {
	return getJson<string[]>('/auth/audit/events', {}, signal);
}
