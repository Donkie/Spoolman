import {
	claimInstance,
	getAuthConfig,
	getAuthSession,
	login,
	logout,
	type AuthUserInfo,
	type Level
} from '$lib/api/auth';
import { setAuthHandlers } from '$lib/api/http';
import { setLiveAuthCloseHandler } from '$lib/api/live';
import { toasts } from './toasts.svelte';
import * as m from '$lib/paraglide/messages';

// Who is signed in, and what they may do.
//
// The important property: when the server reports authentication is disabled, every
// capability getter answers true. That is what keeps the default configuration
// pixel-identical to an instance built before auth existed — no call site needs to know
// whether auth is on, and nothing has to be conditionally rendered for the common case.
//
// Gating here is cosmetic. The server is the authority; this only avoids showing people
// buttons that would fail.

const RANKS: Record<Level, number> = { read: 0, edit: 1, manage: 2 };

class Auth {
	/** Whether the server enforces authentication at all. */
	enabled = $state(false);
	/** Whether the first load has finished. Nothing should render until this is true. */
	ready = $state(false);
	/** Whether the instance is unclaimed and awaiting an owner. */
	setupRequired = $state(false);
	/** Whether the server grants unauthenticated read access. */
	anonymousRead = $state(false);

	authenticated = $state(false);
	anonymous = $state(false);
	level = $state<Level>('manage');
	isAdmin = $state(true);
	isOwner = $state(true);
	user = $state<AuthUserInfo | null>(null);

	// Unlike the other stores, load() can be re-entered — by a sign-in, a sign-out, or a
	// 401 arriving mid-flight — so concurrent calls share one request.
	#inflight: Promise<void> | null = null;

	async load(): Promise<void> {
		this.#inflight ??= this.#load().finally(() => {
			this.#inflight = null;
		});
		return this.#inflight;
	}

	async #load(): Promise<void> {
		try {
			const config = await getAuthConfig();
			this.enabled = config.enabled;
			this.setupRequired = config.setup_required;
			this.anonymousRead = config.anonymous_read;

			if (!config.enabled) {
				this.#applyDisabled();
				return;
			}
			this.#apply(await getAuthSession());
		} catch (e) {
			// Reaching neither endpoint means we cannot know. Assume the restrictive
			// answer rather than rendering an interface the server will refuse.
			console.error('Failed to load authentication state', e);
			this.#applySignedOut();
		} finally {
			this.ready = true;
		}
	}

	#applyDisabled(): void {
		this.authenticated = true;
		this.anonymous = false;
		this.level = 'manage';
		this.isAdmin = true;
		this.isOwner = true;
		this.user = null;
	}

	#applySignedOut(): void {
		this.authenticated = false;
		this.anonymous = false;
		this.level = 'read';
		this.isAdmin = false;
		this.isOwner = false;
		this.user = null;
	}

	#apply(session: {
		authenticated: boolean;
		anonymous: boolean;
		level: Level;
		is_admin: boolean;
		is_owner: boolean;
		user: AuthUserInfo | null;
	}): void {
		this.authenticated = session.authenticated;
		this.anonymous = session.anonymous;
		this.level = session.level;
		this.isAdmin = session.is_admin;
		this.isOwner = session.is_owner;
		this.user = session.user;
	}

	async signIn(username: string, password: string, remember: boolean): Promise<void> {
		this.#apply(await login(username, password, remember));
		this.setupRequired = false;
	}

	async claim(username: string, password: string, displayName?: string): Promise<void> {
		this.#apply(await claimInstance(username, password, displayName));
		this.setupRequired = false;
	}

	async signOut(): Promise<void> {
		try {
			await logout();
		} catch (e) {
			// The session may already be gone server-side, which is not a failure worth
			// blocking on — the local state still has to be cleared either way.
			console.error('Sign-out request failed', e);
		}
		this.markSignedOut();
	}

	/** Drop local session state, e.g. after the server answered 401. */
	markSignedOut(): void {
		if (!this.enabled) return;
		this.#applySignedOut();
	}

	get canRead(): boolean {
		return !this.enabled || this.authenticated || this.anonymous;
	}

	get canEdit(): boolean {
		return !this.enabled || (this.authenticated && RANKS[this.level] >= RANKS.edit);
	}

	get canManage(): boolean {
		return !this.enabled || (this.authenticated && RANKS[this.level] >= RANKS.manage);
	}

	/** True when the instance is unclaimed and the setup screen should be shown. */
	get needsSetup(): boolean {
		return this.enabled && this.setupRequired;
	}

	/** True when a signed-in user must change their password before continuing. */
	get mustChangePassword(): boolean {
		return this.user?.must_change_password ?? false;
	}

	/** How to address the signed-in user in the interface. */
	get displayName(): string {
		return this.user?.display_name || this.user?.username || '';
	}
}

export const auth = new Auth();

// Wire the API layer's rejection handling back to this store. Registered here rather
// than imported there, because http.ts and live.ts must not depend on a store.
setAuthHandlers({
	unauthorized: () => auth.markSignedOut(),
	forbidden: () => toasts.error(m['auth.forbidden']())
});

setLiveAuthCloseHandler(() => auth.markSignedOut());
