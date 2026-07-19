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
 * Browser / PWA push notifications for offline message delivery.
 * `enable()` asks permission, subscribes, and registers the subscription with
 * the backend. Auto-refreshes the subscription on load when already granted.
 */
export function useWebPush() {
  const authed = useAuthStore((s) => s.isAuthenticated());
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  );
  const [busy, setBusy] = useState(false);

  // Keep the subscription fresh whenever we're already permitted + logged in.
  useEffect(() => {
    if (supported && authed && Notification.permission === 'granted') {
      subscribeNow().catch(() => undefined);
    }
  }, [authed]);

  const enable = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === 'granted') await subscribeNow();
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, permission, busy, enable };
}
