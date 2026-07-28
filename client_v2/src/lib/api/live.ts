import { wsUrl } from './config';

// Live-update connection backed by the Spoolman WebSocket API. One socket per
// resource (`/api/v1/spool`, `/filament`, `/vendor`) is shared by every
// subscriber; it opens on first subscribe and reconnects on drop. Server
// messages are `{type, resource, date, payload}` where payload is the full API
// entity (see spoolman/api/v1/models.py Event).

export type Resource = 'spool' | 'filament' | 'vendor';
export type LiveEventType = 'added' | 'updated' | 'deleted';

export interface LiveEvent {
	type: LiveEventType;
	resource: Resource;
	id: string | number;
	/** Raw API entity JSON (mapped to domain types by the cache). */
	payload?: Record<string, unknown>;
}

export type LiveHandler = (event: LiveEvent) => void;

export interface SubscribeOpts {
	id?: string | number;
	ids?: (string | number)[];
}

export interface LiveConnection {
	subscribe(resource: Resource, opts: SubscribeOpts, handler: LiveHandler): () => void;
	/** Reopen sockets that an auth rejection stopped, after signing back in. */
	rearm(): void;
}

interface Sub {
	opts: SubscribeOpts;
	handler: LiveHandler;
}

interface ResourceSocket {
	ws: WebSocket | null;
	subs: Set<Sub>;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
	pingTimer: ReturnType<typeof setInterval> | null;
	closed: boolean;
	/** Set when the server rejected us on auth grounds; suppresses reconnects until rearm(). */
	authBlocked: boolean;
	/** Consecutive failed connects; drives exponential reconnect backoff. */
	attempts: number;
}

// Reconnect backoff. A dropped backend (restart, crash, laptop sleep) used to be
// retried every fixed 2s forever, per resource — a tab left open overnight then
// racked up thousands of failed connects, each one an un-collectable console
// error that bloats memory and janks the page. We back off exponentially with
// jitter up to a cap instead, and reconnect immediately when the browser signals
// it's back (network 'online' or the tab becoming visible again).
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// Close codes the server sends after accepting the handshake. 4000 + the HTTP status
// they stand in for, matching the backend's convention.
const WS_UNAUTHENTICATED = 4401;
const WS_FORBIDDEN = 4403;

let authCloseHandler: (() => void) | null = null;

/**
 * Register what to do when the server closes a socket on authentication grounds.
 *
 * Inverted rather than importing the auth store, which would be a cycle.
 */
export function setLiveAuthCloseHandler(handler: () => void): void {
	authCloseHandler = handler;
}

class WebSocketLive implements LiveConnection {
	private sockets = new Map<Resource, ResourceSocket>();

	constructor() {
		if (typeof window !== 'undefined') {
			const wake = () => this.reconnectAllNow();
			window.addEventListener('online', wake);
			document.addEventListener('visibilitychange', () => {
				if (!document.hidden) wake();
			});
		}
	}

	subscribe(resource: Resource, opts: SubscribeOpts, handler: LiveHandler): () => void {
		const sock = this.ensure(resource);
		const sub: Sub = { opts, handler };
		sock.subs.add(sub);
		return () => {
			sock.subs.delete(sub);
			if (sock.subs.size === 0) this.teardown(resource);
		};
	}

	private ensure(resource: Resource): ResourceSocket {
		let sock = this.sockets.get(resource);
		if (!sock) {
			sock = {
				ws: null,
				subs: new Set(),
				reconnectTimer: null,
				pingTimer: null,
				closed: false,
				authBlocked: false,
				attempts: 0
			};
			this.sockets.set(resource, sock);
			this.open(resource, sock);
		}
		return sock;
	}

	private open(resource: Resource, sock: ResourceSocket) {
		if (typeof WebSocket === 'undefined') return; // SSR / no WS support
		let ws: WebSocket;
		try {
			ws = new WebSocket(wsUrl('/' + resource));
		} catch {
			this.scheduleReconnect(resource, sock);
			return;
		}
		sock.ws = ws;

		ws.onmessage = (ev) => {
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(ev.data as string);
			} catch {
				return;
			}
			if (!msg || msg.status) return; // ignore health/ping replies
			const payload = msg.payload as Record<string, unknown> | undefined;
			const id = (payload?.id as string | number | undefined) ?? '';
			const event: LiveEvent = {
				type: msg.type as LiveEventType,
				resource,
				id,
				payload
			};
			for (const sub of sock.subs) {
				const { id: subId, ids } = sub.opts;
				if (subId != null && subId !== id) continue;
				if (ids && !ids.includes(id)) continue;
				sub.handler(event);
			}
		};

		ws.onopen = () => {
			sock.attempts = 0; // connected — reset backoff
			// Light keepalive; the server replies {status:"healthy"} which we ignore.
			sock.pingTimer = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send('ping');
			}, 25000);
		};

		ws.onclose = (ev) => {
			if (sock.pingTimer) clearInterval(sock.pingTimer);
			sock.pingTimer = null;
			sock.ws = null;

			// An auth rejection is permanent until something changes, unlike a dropped
			// backend. Retrying it would hammer the server on a backoff loop that can
			// never succeed, so stop and let the app react. Subscribers are kept, so
			// rearm() can bring every view back after a sign-in without re-subscribing.
			//
			// This only works because the server accepts the handshake before closing.
			// A close sent before the accept is turned into an HTTP 403 by uvicorn and
			// the code never arrives — see spoolman/auth/dependencies.py.
			if (ev.code === WS_UNAUTHENTICATED || ev.code === WS_FORBIDDEN) {
				sock.authBlocked = true;
				authCloseHandler?.();
				return;
			}

			if (!sock.closed && sock.subs.size > 0) this.scheduleReconnect(resource, sock);
		};

		ws.onerror = () => ws.close();
	}

	private scheduleReconnect(resource: Resource, sock: ResourceSocket) {
		if (sock.reconnectTimer || sock.authBlocked) return;
		const delay = this.backoffDelay(sock.attempts);
		sock.attempts++;
		sock.reconnectTimer = setTimeout(() => {
			sock.reconnectTimer = null;
			if (!sock.closed && sock.subs.size > 0) this.open(resource, sock);
		}, delay);
	}

	/** Exponential backoff with full jitter, capped at RECONNECT_MAX_MS. Jitter
	 *  spreads the three resource sockets so they don't retry in lockstep. */
	private backoffDelay(attempts: number): number {
		const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempts);
		return exp / 2 + Math.random() * (exp / 2);
	}

	/** Network came back / tab refocused: retry every down socket now instead of
	 *  waiting out its backoff, and reset the backoff so a fresh drop starts fast. */
	private reconnectAllNow() {
		for (const [resource, sock] of this.sockets) {
			if (sock.closed || sock.authBlocked || sock.subs.size === 0) continue;
			const rs = sock.ws?.readyState;
			if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) continue;
			sock.attempts = 0;
			if (sock.reconnectTimer) {
				clearTimeout(sock.reconnectTimer);
				sock.reconnectTimer = null;
			}
			this.open(resource, sock);
		}
	}

	/**
	 * Retry sockets that were stopped by an auth rejection, after a successful sign-in.
	 *
	 * Distinct from teardown(), which drops the map entry: this keeps every existing
	 * subscriber, so views that were already listening resume without re-subscribing.
	 */
	rearm() {
		for (const [resource, sock] of this.sockets) {
			if (!sock.authBlocked) continue;
			sock.authBlocked = false;
			sock.attempts = 0;
			if (sock.subs.size > 0) this.open(resource, sock);
		}
	}

	private teardown(resource: Resource) {
		const sock = this.sockets.get(resource);
		if (!sock) return;
		sock.closed = true;
		if (sock.reconnectTimer) clearTimeout(sock.reconnectTimer);
		if (sock.pingTimer) clearInterval(sock.pingTimer);
		sock.ws?.close();
		this.sockets.delete(resource);
	}
}

export const live: LiveConnection = new WebSocketLive();
