import { useCallback, useEffect, useState } from 'react';
import { pushApi } from '@/api/push.api';
import { useAuthStore } from '@/store/auth.store';

/** VAPID public key (base64url) → Uint8Array for PushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  return existing ?? navigator.serviceWorker.register('/sw.js');
}

async function subscribeNow(): Promise<boolean> {
  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  const { key } = await pushApi.vapidKey();
  if (!key) return false;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
    }));
  await pushApi.subscribe(sub.toJSON());
  return true;
}

/**
 * ── ONCE PER LOAD, NOT ONCE PER MOUNT ───────────────────────────────────────
 *
 * `AppShell` is the `element` of THREE separate route blocks in router.tsx, so
 * crossing from one block to another mounts a different instance of it and
 * every effect inside runs again. The file already knows this about itself —
 * it is why CallCenter moved up to App — and this hook was written as though
 * the shell were a singleton.
 *
 * Measured on the live site, walking the thirteen hub doors in one session:
 * `/push/vapid-public-key` fetched FOURTEEN times and `/push/subscribe`
 * POSTed THIRTEEN. Twenty-seven of the walk's 135 requests were the same
 * handshake re-run, for a subscription that had not changed since the first
 * one. Nothing failed and nothing looked wrong — it is pure waste, which is
 * why it survived.
 *
 * The neighbouring hooks are not affected: they go through the query cache,
 * which dedupes a refetch-on-mount. This one is a bare effect around two
 * network calls, so it had nothing to dedupe against.
 *
 * `inFlight` is the whole fix: the refresh is a promise held for the life of
 * the document and re-armed only when the citizen signs out. `enable()` is
 * deliberately NOT gated by it — that path runs because somebody pressed a
 * button, and a button that silently does nothing the second time is worse
 * than a duplicate request.
 */
let inFlight: Promise<boolean> | null = null;

/**
 * Browser / PWA push notifications for offline message delivery.
 * `enable()` asks permission, subscribes, and registers the subscription with
 * the backend. Auto-refreshes the subscription once per load when already
 * granted.
 */
export function useWebPush() {
  const authed = useAuthStore((s) => s.isAuthenticated());
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  );
  const [busy, setBusy] = useState(false);

  // Keep the subscription fresh whenever we're already permitted + logged in —
  // once, however many times the shell that calls this remounts.
  useEffect(() => {
    if (!(supported && authed && Notification.permission === 'granted')) {
      // Signed out, or not permitted: the next sign-in should refresh again.
      inFlight = null;
      return;
    }
    inFlight ??= subscribeNow().catch(() => false);
  }, [authed]);

  const enable = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === 'granted') {
        const run = subscribeNow();
        inFlight = run.catch(() => false);
        await run;
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, permission, busy, enable };
}
