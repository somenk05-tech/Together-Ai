import { http } from './client';

/**
 * ── WHERE THIS BROWSER FIRST CAME FROM (owner, 16 Sep) ─────────────────────
 *
 * "Support UTM parameters … show acquisition quality." The first time a
 * browser opens the city, the campaign tags in its address and the site that
 * sent it are kept here — the referring HOST only, never the page. The visit
 * beacon carries them (visits.api.ts), and after sign-in they are sent once
 * with the member's account so the dashboard can say which channels bring
 * members who stay. Storage that is unavailable simply means "direct".
 */
const KEY = 'tc:origin';
const SENT = 'tc:origin-sent';

export interface FirstTouch {
  src: string | null; med: string | null; cmp: string | null; cnt: string | null; trm: string | null;
  ref: string | null; at: string;
}

const clip = (v: string | null) => (v ? v.slice(0, 120) : null);

function read(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}

/** The first touch, captured on this load if there is none yet. */
export function firstTouch(): FirstTouch | null {
  const kept = read();
  if (kept) return kept;
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  let ref: string | null = null;
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    ref = r && r.hostname !== window.location.hostname ? `${r.protocol}//${r.hostname}` : null;
  } catch { ref = null; }
  const touch: FirstTouch = {
    src: clip(q.get('utm_source')), med: clip(q.get('utm_medium')), cmp: clip(q.get('utm_campaign')),
    cnt: clip(q.get('utm_content')), trm: clip(q.get('utm_term')), ref, at: new Date().toISOString(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(touch)); } catch { /* counted as it is, once */ }
  return touch;
}

/** Once per account per browser: tell the city how this member first arrived. */
export function sendOrigin(userId: string, visitor: string | null): void {
  const marker = `${SENT}:${userId}`;
  try { if (localStorage.getItem(marker)) return; } catch { return; }
  const t = firstTouch();
  http.post('/insights/origin', {
    visitor, source: t?.src ?? null, medium: t?.med ?? null, campaign: t?.cmp ?? null,
    content: t?.cnt ?? null, term: t?.trm ?? null, referrer: t?.ref ?? null, landedAt: t?.at ?? null,
  }).then(() => { try { localStorage.setItem(marker, '1'); } catch { /* sent again next time; the server keeps the first */ } })
    .catch(() => undefined);
}
