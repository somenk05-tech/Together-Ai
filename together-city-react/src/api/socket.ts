import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import { WS, type WsEvent } from './events';

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
  return socket;
}

/** Typed Socket.IO wrapper — the only real-time surface the app uses. */
export const socketClient = {
  connect(): void { const s = getSocket(); if (!s.connected) s.connect(); },
  disconnect(): void { socket?.disconnect(); },
  /** Tear the socket down completely on a user switch, so the next user gets a
   *  fresh connection (new token, no inherited room subscriptions). */
  reset(): void {
    try { socket?.removeAllListeners(); socket?.disconnect(); } catch { /* noop */ }
    socket = null;
  },
  connected(): boolean { return Boolean(socket?.connected); },
  emit(event: WsEvent, payload: unknown): void { getSocket().emit(event, payload); },
  on<T>(event: WsEvent, handler: (payload: T) => void): () => void {
    const s = getSocket();
    s.on(event, handler as (p: unknown) => void);
    return () => { s.off(event, handler as (p: unknown) => void); };
  },
  raw(): Socket { return getSocket(); },
};

export { WS };
export type { WsEvent };
