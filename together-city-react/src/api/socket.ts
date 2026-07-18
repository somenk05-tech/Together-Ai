import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import { WS, type WsEvent } from './events';

const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';

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
