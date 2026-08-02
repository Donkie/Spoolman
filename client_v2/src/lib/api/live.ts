import { wsUrl } from './config';
import { getJson } from './http';

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

// A handshake refused by a forward-auth proxy looks exactly like a backend that
// is down: the browser's WebSocket API gives us no HTTP status for a failed
// upgrade, just a close event. So when a socket dies without ever having opened,
// we ask the same question over HTTP, where the answer is legible — and if that
// answer is 401, http.ts reloads the page (see ./auth.ts). Any other outcome,
// including the backend being genuinely down, is ignored here and left to the
// reconnect backoff.
const AUTH_PROBE_MIN_INTERVAL_MS = 10000;
let lastAuthProbeAt = 0;

function probeAuth(): void {
	const now = Date.now();
	// The three resource sockets go down together and back off independently;
	// one probe answers for all of them.
	if (now - lastAuthProbeAt < AUTH_PROBE_MIN_INTERVAL_MS) return;
	lastAuthProbeAt = now;
	getJson('/info').catch(() => {
		/* backend down, or a 401 that has already triggered the reload */
	});
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
		// This socket's own keepalive handle. Kept local (not just on `sock`) so a
		// superseded socket can clean up after itself without touching the shared
		// `sock` state — see the identity guards below.
		let pingTimer: ReturnType<typeof setInterval> | null = null;
		// Whether this socket ever completed its handshake, which is what tells a
		// refused connection apart from a dropped one.
		let opened = false;

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

		// A socket can be superseded before its own events land: reconnectAllNow()
		// opens a replacement while this one is still CLOSING, and the late
		// onopen/onclose would then clobber the replacement's state (killing its
		// keepalive, or nulling sock.ws under it). Every handler that touches the
		// shared `sock` first checks it is still the current socket.
		ws.onopen = () => {
			opened = true;
			if (sock.ws !== ws) {
				ws.close(); // superseded while connecting — drop it
				return;
			}
			sock.attempts = 0; // connected — reset backoff
			// Light keepalive; the server replies {status:"healthy"} which we ignore.
			pingTimer = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send('ping');
			}, 25000);
			sock.pingTimer = pingTimer;
		};

		ws.onclose = () => {
			// Always stop our own keepalive, current socket or not, so a superseded
			// socket doesn't leak its interval.
			if (pingTimer) clearInterval(pingTimer);
			pingTimer = null;
			if (sock.ws !== ws) return; // a replacement is live — leave it alone
			sock.pingTimer = null;
			sock.ws = null;
			if (!sock.closed && sock.subs.size > 0) {
				// Refused rather than dropped — ask HTTP whether it's an auth problem.
				// A socket that had been open and then died gets checked on its next
				// failed reconnect instead, which is one backoff step away.
				if (!opened) probeAuth();
				this.scheduleReconnect(resource, sock);
			}
		};

		ws.onerror = () => ws.close();
	}

	private scheduleReconnect(resource: Resource, sock: ResourceSocket) {
		if (sock.reconnectTimer) return;
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
			if (sock.closed || sock.subs.size === 0) continue;
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
