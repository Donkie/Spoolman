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
}

class WebSocketLive implements LiveConnection {
	private sockets = new Map<Resource, ResourceSocket>();

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
			sock = { ws: null, subs: new Set(), reconnectTimer: null, pingTimer: null, closed: false };
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
			// Light keepalive; the server replies {status:"healthy"} which we ignore.
			sock.pingTimer = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send('ping');
			}, 25000);
		};

		ws.onclose = () => {
			if (sock.pingTimer) clearInterval(sock.pingTimer);
			sock.pingTimer = null;
			sock.ws = null;
			if (!sock.closed && sock.subs.size > 0) this.scheduleReconnect(resource, sock);
		};

		ws.onerror = () => ws.close();
	}

	private scheduleReconnect(resource: Resource, sock: ResourceSocket) {
		if (sock.reconnectTimer) return;
		sock.reconnectTimer = setTimeout(() => {
			sock.reconnectTimer = null;
			if (!sock.closed && sock.subs.size > 0) this.open(resource, sock);
		}, 2000);
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
