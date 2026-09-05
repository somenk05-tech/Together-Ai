import { useSyncExternalStore } from 'react';
import { socketState, type SocketState } from '@/api/socket';

/** Whether the real-time socket is up, away, or off — for the strip. */
export function useSocketState(): SocketState {
  return useSyncExternalStore(socketState.subscribe, socketState.get, () => 'off' as const);
}
