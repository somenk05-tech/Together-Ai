import { io, type Socket } from 'socket.io-client';
import { isTokenExpired, useAuthStore } from '@/store/auth.store';
import { WS, type WsEvent } from './events';

/**
 * ── THE SOCKET COMES BACK, AND SAYS WHEN IT IS AWAY (launch gate, third
 *    reading, 4 Sep) ──────────────────────────────────────────────────────
 *
 * Access tokens live fifteen minutes. The server re-checks the token on the
 * handshake and every sixty seconds after, and when it has expired it emits
 * `error_event { message: 'Unauthorized' }` and calls `disconnect(true)`.
 * Socket.IO does NOT reconnect after a server-side disconnect, and nothing
 * here listened for one — so the first token expiry after a page load took
 * real-time down for good: no new messages, no receipts, no typing, no
 * ringing. The one visible symptom was the word "Unauthorized" under the
 * composer when the reader tried to send.
 *
 * Now: a stale token is refreshed BEFORE the first connect; a server-side
 * disconnect or a handshake refusal refreshes the pair and reconnects, with a
 * backoff that cannot loop (1 s doubling to 30 s, reset on success); and the
 * state is published so the shell can show a strip while the socket is away.
 * A disconnect the client asked for is left alone.
 */
export type SocketState = 'off' | 'connected' | 'reconnecting';
let state: SocketState = 'off';
const listeners = new Set<() => void>();
function setState(next: SocketState): void {
  if (state === next) return;
  state = next;
  for (const l of listeners) l();
}
/** For useSyncExternalStore: subscribe + read. */
export const socketState = {
  subscribe: (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: (): SocketState => state,
};

let backoffMs = 1_000;
let retryTimer: number | null = null;
let recovering = false;

/** Refresh the pair if the stored token is stale, then connect — or give up
 *  quietly when the session is gone (the auth store already cleared it). */
async function connectFresh(s: Socket): Promise<void> {
  const st = useAuthStore.getState();
  if (st.tokens?.accessToken && isTokenExpired(st.tokens.accessToken)) await st.refresh();
  if (!useAuthStore.getState().tokens?.accessToken) { setState('off'); return; }
  if (!s.connected) s.connect();
}

/** After a server-side disconnect: refresh, wait out the backoff, reconnect. */
function recover(s: Socket): void {
  if (recovering) return;
  recovering = true;
  setState('reconnecting');
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, 30_000);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void connectFresh(s).finally(() => { recovering = false; });
  }, delay);
}

/**
 * Where the Socket.IO server lives. Prefer VITE_SOCKET_URL, but if it's not set
 * fall back to the API origin (the backend serves REST + WS on the same host) —
 * so real-time still works in production even when only VITE_API_URL is
 * configured. The WS server is at the origin root (setGlobalPrefix('api') only
 * affects HTTP routes), so strip any trailing /api.
 */
function resolveSocketUrl(): string {
  const explicit = import.meta.env.VITE_SOCKET_URL;
  if (explicit) return explicit;
  // Derive from an ABSOLUTE api url (strip trailing /api → origin root).
  const api = import.meta.env.VITE_API_URL;
  if (api && /^https?:\/\//.test(api)) return api.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  // Fall back to the live backend origin (never localhost in a production bundle).
  return import.meta.env.DEV ? 'http://localhost:3000' : 'https://together-ai-production.up.railway.app';
}

const SOCKET_URL: string = resolveSocketUrl();

let socket: Socket | null = null;

function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket'],
    auth: (cb) => cb({ token: useAuthStore.getState().tokens?.accessToken ?? '' }),
  });
  const s = socket;
  s.on('connect', () => { backoffMs = 1_000; setState('connected'); });
  s.on('disconnect', (reason) => {
    // Our own disconnect() — sign-out, user switch — is not a fault.
    if (reason === 'io client disconnect') { setState('off'); return; }
    // The server closed it (expired token, revoked session): Socket.IO will
    // not come back on its own, so this does. Any other reason — transport
    // closed, ping timeout — Socket.IO retries itself; the strip shows
    // meanwhile and `connect` clears it.
    if (reason === 'io server disconnect') recover(s);
    else setState('reconnecting');
  });
  s.on('connect_error', () => {
    // A refused handshake (stale token at connect time) also never retries
    // with a fresh token unless something refreshes it.
    if (useAuthStore.getState().tokens?.accessToken) recover(s);
    else setState('off');
  });
  return socket;
}

/** Typed Socket.IO wrapper — the only real-time surface the app uses. */
export const socketClient = {
  connect(): void { void connectFresh(getSocket()); },
  disconnect(): void {
    if (retryTimer != null) { window.clearTimeout(retryTimer); retryTimer = null; }
    recovering = false;
    socket?.disconnect();
    setState('off');
  },
  /** Tear the socket down completely on a user switch, so the next user gets a
   *  fresh connection (new token, no inherited room subscriptions). */
  reset(): void {
    if (retryTimer != null) { window.clearTimeout(retryTimer); retryTimer = null; }
    recovering = false; backoffMs = 1_000;
    try { socket?.removeAllListeners(); socket?.disconnect(); } catch { /* noop */ }
    socket = null;
    setState('off');
  },
  connected(): boolean { return Boolean(socket?.connected); },
  emit(event: WsEvent, payload: unknown): void { getSocket().emit(event, payload); },
  /**
   * ── A FAILED SEND IS NOT SENT LATER (5 Sep) ────────────────────────────────
   * socket.io buffers an emit made while the socket is down and flushes the
   * buffer on reconnect. A message that had ALREADY been reported as failed —
   * the ten-second timer fired, the composer kept the text, the citizen
   * pressed send again — then went out twice: once from the buffer, once from
   * the retry. This drops one buffered frame by a predicate, so "failed" means
   * failed and the retry is the only copy.
   */
  forget(event: WsEvent, match: (payload: unknown) => boolean): void {
    const s = socket as (Socket & { sendBuffer?: Array<{ data?: unknown[] }> }) | null;
    if (!s?.sendBuffer) return;
    s.sendBuffer = s.sendBuffer.filter((p) => {
      const data: unknown[] = Array.isArray(p.data) ? p.data : [];
      return !(data[0] === event && match(data[1]));
    });
  },
  on<T>(event: WsEvent, handler: (payload: T) => void): () => void {
    const s = getSocket();
    s.on(event, handler as (p: unknown) => void);
    return () => { s.off(event, handler as (p: unknown) => void); };
  },
  raw(): Socket { return getSocket(); },
};

export { WS };
export type { WsEvent };
