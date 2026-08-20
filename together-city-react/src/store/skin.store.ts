import { create } from 'zustand';
import { SKINNABLE, skinByKey, type SkinnableHub } from '@/config/skins';

/**
 * WHICH SKIN EACH RE-SKINNABLE ROOM IS WEARING.
 *
 * ── WHY THIS IS ON THE DEVICE AND NOT ON THE SERVER ─────────────────────────
 * A skin is a preference about a SCREEN, not about a person. The phone in a
 * bright kitchen and the laptop in a dark room are two different arguments for
 * two different answers, and one account-wide value would be wrong on one of
 * them every time. It also means the room is painted on the first frame after
 * a reload rather than after a round trip — a page that renders white and then
 * repaints itself burgundy is worse than a page that was never offered a skin.
 *
 * ── AND WHY THE READ IS DEFENSIVE ───────────────────────────────────────────
 * `localStorage` throws rather than returns null in a handful of real
 * situations — Safari's private mode historically, an embedded webview with
 * storage disabled, a user who blocked site data. This is a colour preference:
 * it must never be the reason a room fails to render. Every path through
 * `read` returns a valid value or `null`, and `null` is the default the city
 * ships with anyway.
 *
 * A stored key that is no longer in SKINS resolves to `null` too, which is what
 * makes removing a skin from the list a one-line operation rather than a
 * migration.
 */

const KEY = (hub: SkinnableHub) => `tc.skin.${hub}`;

const read = (hub: SkinnableHub): string | null => {
  try {
    return skinByKey(window.localStorage.getItem(KEY(hub)))?.key ?? null;
  } catch {
    return null;
  }
};

const write = (hub: SkinnableHub, key: string | null): void => {
  try {
    if (key === null) window.localStorage.removeItem(KEY(hub));
    else window.localStorage.setItem(KEY(hub), key);
  } catch {
    /* A preference that cannot be remembered still applies for this visit. */
  }
};

interface SkinState {
  /** hub key → skin key, or null for the city's own white and black */
  skins: Record<SkinnableHub, string | null>;
  setSkin: (hub: SkinnableHub, key: string | null) => void;
}

export const useSkinStore = create<SkinState>((set) => ({
  skins: Object.fromEntries(SKINNABLE.map((h) => [h, read(h)])) as Record<SkinnableHub, string | null>,
  setSkin: (hub, key) => {
    write(hub, key);
    set((s) => ({ skins: { ...s.skins, [hub]: key } }));
  },
}));
