import { wsUrl } from './config';
import { getJson } from './http';
import { mapSpool, mapFilament, mapVendor } from './map';
import { inventory } from '$lib/stores/inventory.svelte';
import type { Spool } from '$lib/types';

// The NFC/RFID scan relay: a reader taps a tag, POSTs it to /api/v1/tag/scan,
// and the server fans that out over a websocket to whichever browsers are
// listening. This is the client for that socket.
//
// It is deliberately NOT part of live.ts. That module is one socket per entity
// resource (`spool`, `filament`, `vendor`), each feeding inventory.ingest — and a
// scan is not an entity. It has no id, nothing to cache it under, and must never
// enter the inventory cache as though it were a record. Its URL also carries a
// reader id where live.ts's carries a resource name. What IS worth sharing is the
// hard-won connection behaviour, so the backoff, the wake-on-online/visible
// listeners, the keepalive and the 401 probe below are all deliberate copies of
// live.ts rather than an attempt to generalize one module over both.
//
// Which pool you get comes from the path and nothing else:
//   /tag/scan             every reader
//   /tag/scan/{reader_id} that reader only
// That is the whole of pairing — subscribe to the root, wait for one tap, read
// its reader_id, then resubscribe to that reader. No server state is involved and
// nothing needs to be told you paired.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

/** One tap, as broadcast to every browser listening to the reader that saw it. */
export interface TagScan {
	uid: string;
	/** Always present. Readers that send none are given one derived from their
	 *  address (`ip-192-168-1-50`), which is what makes pairing work with an
	 *  unmodified off-the-shelf agent. */
	readerId: string;
	/** The reader's friendly name, when it sends one. Prefer it over `readerId`. */
	name?: string;
	/** Tag hardware type, e.g. "ntag". Informational. */
	format?: string;
	/** Raw tag contents, base64. Phase 1 does not decode it. */
	payloadB64?: string;
	/** The spool this tag is linked to, absent when the tag is unknown. Embedded
	 *  in the event in full, so acting on a scan needs no follow-up request. */
	spool?: Spool;
}

export type ScanHandler = (scan: TagScan) => void;

/** `null` means the root pool: every reader. */
export type ReaderPool = string | null;

// See live.ts — same reasoning, same numbers, so a relay socket and an entity
// socket behave identically when the backend goes away and comes back.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const KEEPALIVE_MS = 25000;

const AUTH_PROBE_MIN_INTERVAL_MS = 10000;
let lastAuthProbeAt = 0;

function probeAuth(): void {
	const now = Date.now();
	if (now - lastAuthProbeAt < AUTH_PROBE_MIN_INTERVAL_MS) return;
	lastAuthProbeAt = now;
	getJson('/info').catch(() => {
		/* backend down, or a 401 that has already triggered the reload */
	});
}

/** Pool → socket path. The reader id is a path segment, and the server constrains
 *  it to `[A-Za-z0-9._:-]` precisely so it can travel as one. */
function pathFor(pool: ReaderPool): string {
	return pool === null ? '/tag/scan' : `/tag/scan/${encodeURIComponent(pool)}`;
}

/**
 * Map a broadcast payload to a `TagScan`.
 *
 * The embedded spool is cached on the way past, exactly as a spool arriving from
 * any other endpoint would be: a scan that is about to open an inspector should
 * find the filament and manufacturer already there. Note that this is the only
 * thing a scan puts in the cache — the scan itself is an event, not a record.
 */
function toScan(payload: Json): TagScan {
	const raw = payload.spool as Json | undefined;
	let spool: Spool | undefined;
	if (raw) {
		if (raw.filament) {
			inventory.upsertFilament(mapFilament(raw.filament));
			if (raw.filament.vendor) inventory.upsertVendor(mapVendor(raw.filament.vendor));
		}
		spool = mapSpool(raw);
		inventory.upsertSpool(spool);
	}
	return {
		uid: payload.uid,
		readerId: payload.reader_id,
		name: payload.name ?? undefined,
		format: payload.format ?? undefined,
		payloadB64: payload.payload_b64 ?? undefined,
		spool
	};
}

interface PoolSocket {
	ws: WebSocket | null;
	subs: Set<ScanHandler>;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
	closed: boolean;
	attempts: number;
}

class ScanRelay {
	#sockets = new Map<string, PoolSocket>();

	constructor() {
		if (typeof window !== 'undefined') {
			const wake = () => this.#reconnectAllNow();
			window.addEventListener('online', wake);
			document.addEventListener('visibilitychange', () => {
				if (!document.hidden) wake();
			});
		}
	}

	/**
	 * Listen to one reader, or to every reader with `null`. Returns an unsubscribe;
	 * the socket opens on the first subscriber to a pool and closes after the last
	 * one leaves, so a browser that is not using NFC holds no connection at all.
	 */
	subscribe(pool: ReaderPool, handler: ScanHandler): () => void {
		const key = pathFor(pool);
		const sock = this.#ensure(key);
		sock.subs.add(handler);
		return () => {
			sock.subs.delete(handler);
			if (sock.subs.size === 0) this.#teardown(key);
		};
	}

	#ensure(key: string): PoolSocket {
		let sock = this.#sockets.get(key);
		if (!sock) {
			sock = { ws: null, subs: new Set(), reconnectTimer: null, closed: false, attempts: 0 };
			this.#sockets.set(key, sock);
			this.#open(key, sock);
		}
		return sock;
	}

	#open(key: string, sock: PoolSocket) {
		if (typeof WebSocket === 'undefined') return; // SSR / no WS support
		let ws: WebSocket;
		try {
			ws = new WebSocket(wsUrl(key));
		} catch {
			this.#scheduleReconnect(key, sock);
			return;
		}
		sock.ws = ws;
		// Kept local as well as on `sock` so a superseded socket can clean up after
		// itself without touching the shared state — see the identity guards below.
		let pingTimer: ReturnType<typeof setInterval> | null = null;
		let opened = false;

		ws.onmessage = (ev) => {
			let msg: Json;
			try {
				msg = JSON.parse(ev.data as string);
			} catch {
				return;
			}
			if (!msg || msg.status) return; // ignore health/ping replies
			if (!msg.payload?.uid) return;
			const scan = toScan(msg.payload);
			// Copied so a handler that unsubscribes (the pairing flow does, on its
			// first scan) doesn't mutate the set we are iterating.
			for (const handler of [...sock.subs]) handler(scan);
		};

		ws.onopen = () => {
			opened = true;
			if (sock.ws !== ws) {
				ws.close(); // superseded while connecting — drop it
				return;
			}
			sock.attempts = 0;
			pingTimer = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send('ping');
			}, KEEPALIVE_MS);
		};

		ws.onclose = () => {
			if (pingTimer) clearInterval(pingTimer);
			pingTimer = null;
			if (sock.ws !== ws) return; // a replacement is live — leave it alone
			sock.ws = null;
			if (!sock.closed && sock.subs.size > 0) {
				if (!opened) probeAuth();
				this.#scheduleReconnect(key, sock);
			}
		};

		ws.onerror = () => ws.close();
	}

	#scheduleReconnect(key: string, sock: PoolSocket) {
		if (sock.reconnectTimer) return;
		const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** sock.attempts);
		const delay = exp / 2 + Math.random() * (exp / 2); // full jitter
		sock.attempts++;
		sock.reconnectTimer = setTimeout(() => {
			sock.reconnectTimer = null;
			if (!sock.closed && sock.subs.size > 0) this.#open(key, sock);
		}, delay);
	}

	#reconnectAllNow() {
		for (const [key, sock] of this.#sockets) {
			if (sock.closed || sock.subs.size === 0) continue;
			const rs = sock.ws?.readyState;
			if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) continue;
			sock.attempts = 0;
			if (sock.reconnectTimer) {
				clearTimeout(sock.reconnectTimer);
				sock.reconnectTimer = null;
			}
			this.#open(key, sock);
		}
	}

	#teardown(key: string) {
		const sock = this.#sockets.get(key);
		if (!sock) return;
		sock.closed = true;
		if (sock.reconnectTimer) clearTimeout(sock.reconnectTimer);
		sock.ws?.close();
		this.#sockets.delete(key);
	}
}

export const scanRelay = new ScanRelay();

/** Readers the server has heard from recently. */
export interface KnownReader {
	readerId: string;
	name?: string;
	/** ISO timestamp of the last scan this reader sent. */
	lastSeen: string;
}

/**
 * The readers the server has seen recently, most recent first.
 *
 * This registry is in-memory and per-process: it is **empty after a restart**
 * until something scans again, which is normal and not an error. Treat it as a
 * convenience for picking a reader in another room, never as the list of readers
 * that exist.
 */
export async function listReaders(signal?: AbortSignal): Promise<KnownReader[]> {
	const rows = await getJson<Json[]>('/tag/reader', {}, signal);
	return rows.map((r) => ({
		readerId: r.reader_id,
		name: r.name ?? undefined,
		lastSeen: r.last_seen
	}));
}
