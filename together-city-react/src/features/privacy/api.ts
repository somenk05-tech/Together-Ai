import { http as api } from '@/api/client';
import { usePrivacyStore } from './store';

export interface PrivacyState {
  tosAccepted: boolean;
  acks: Record<string, boolean>;
  prefs: Record<string, boolean>;
}

/**
 * Best-effort sync with the backend privacy store. Gating never waits on the
 * network — the client store is authoritative for UX; the server is the durable,
 * cross-device record. All calls swallow errors so a cold backend can't break
 * navigation into a hub.
 */
export const privacyApi = {
  get: () => api.get<PrivacyState>('/privacy').then((r) => r.data).catch(() => null),
  set: (key: string, value: string) =>
    api.patch<PrivacyState>('/privacy', { key, value }).then((r) => r.data).catch(() => null),
};

/** Pull server state once and merge it into the client store. */
export async function hydratePrivacy(): Promise<void> {
  const server = await privacyApi.get();
  if (server) usePrivacyStore.getState().mergeServer(server);
  else usePrivacyStore.setState({ hydrated: true });
}

export function pushAck(hub: string): void {
  void privacyApi.set(`ack:${hub}`, 'true');
}
export function pushTos(): void {
  void privacyApi.set('tos', 'true');
}
export function pushPref(key: string, value: boolean): void {
  void privacyApi.set(`pref:${key}`, value ? 'true' : 'false');
}
