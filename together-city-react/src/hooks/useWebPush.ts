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
  if (!existing) return navigator.serviceWorker.register('/sw.js');
  /* ASK WHETHER THERE IS A NEWER ONE (re-audit, 29 Aug). Returning the
     existing registration is right — re-registering the same script is a
     no-op — but nothing ever went looking for a new script, and the browser's
     own 24-hour update check is the only other thing that would. Paired with
     `skipWaiting`/`clients.claim` in sw.js, this is what makes a change to the
     worker reach a citizen on the next load rather than on the next day they
     happen to close every tab. Best-effort: a failed update check must not
     stop us subscribing with the worker we have. */
  void existing.update().catch(() => undefined);
  return existing;
}

/**
 * WHAT ACTUALLY HAPPENED, not just whether it worked.
 *
 * `subscribeNow` returned a boolean and every caller threw it away, so Settings
 * decided push was on from `Notification.permission` alone — which only says
 * the citizen ALLOWED the prompt. Deploy without `VAPID_PUBLIC_KEY` and there
 * is no key to subscribe with, the citizen presses Enable, allows the browser
 * prompt, and is told "On — new messages reach you even with the app closed"
 * while nothing has been registered and nothing will ever arrive. The three
 * outcomes are different problems with different answers, so they are three
 * different words.
 */
export type PushState =
  /** Not asked yet, or not permitted — nothing has been attempted. */
  | 'unknown'
  /** Subscribed, and the server holds it. */
  | 'on'
  /** The server has no VAPID key: push is off for this deployment, not for you. */
  | 'unconfigured'
  /** The push service or the claim refused. Worth trying again. */
  | 'failed';

async function subscribeNow(): Promise<PushState> {
  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  const { key } = await pushApi.vapidKey();
  if (!key) return 'unconfigured';
  const subscribe = () => reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
  });
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await subscribe());
  const claimed = await pushApi.subscribe(sub.toJSON());
  if (claimed.ok) return 'on';

  /* `{ ok: false }` MEANS SOMEBODY ELSE HOLDS THIS SUBSCRIPTION, and this
     line used to ignore the answer and report success. It happens on a shared
     browser: the previous account signed out without revoking, so the
     endpoint in the push service is still theirs, and `push.controller`
     refuses to re-point it — correctly, because an unscoped upsert there is
     how you take over somebody's notifications. The account that just signed
     in then had no push on that browser, forever, and was told nothing.
     Sign-out now revokes (see api/session-reset.ts), so this is the repair
     path for a browser that signed out before that shipped: drop the
     inherited subscription and make one of our own. */
  await sub.unsubscribe().catch(() => undefined);
  const fresh = await subscribe();
  const second = await pushApi.subscribe(fresh.toJSON());
  return second.ok ? 'on' : 'failed';
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
let inFlight: Promise<PushState> | null = null;

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
  const [state, setState] = useState<PushState>('unknown');

  // Keep the subscription fresh whenever we're already permitted + logged in —
  // once, however many times the shell that calls this remounts.
  useEffect(() => {
    if (!(supported && authed && Notification.permission === 'granted')) {
      // Signed out, or not permitted: the next sign-in should refresh again.
      inFlight = null;
      setState('unknown');
      return;
    }
    inFlight ??= subscribeNow().catch(() => 'failed' as PushState);
    /* AND THE ANSWER IS READ. Every mount reads the ONE in-flight refresh —
       the dedupe above is what stops thirteen handshakes per session — so a
       screen that mounts later still learns what it said rather than assuming
       the permission prompt settled it. */
    let alive = true;
    void inFlight.then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [authed]);

  const enable = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === 'granted') {
        const run = subscribeNow().catch(() => 'failed' as PushState);
        inFlight = run;
        setState(await run);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, permission, busy, enable, state };
}
