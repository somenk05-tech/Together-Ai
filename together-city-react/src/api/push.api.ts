import { z } from 'zod';
import { apiGet, apiPost } from './http';

export const pushApi = {
  vapidKey: (): Promise<{ key: string }> =>
    apiGet('/push/vapid-public-key', z.object({ key: z.string() })),
  subscribe: (subscription: unknown): Promise<{ ok: boolean }> =>
    apiPost('/push/subscribe', { subscription }, z.object({ ok: z.boolean() })),
  unsubscribe: (subscription: unknown): Promise<{ ok: boolean }> =>
    apiPost('/push/unsubscribe', { subscription }, z.object({ ok: z.boolean() })),
};
