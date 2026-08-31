import { createHmac, timingSafeEqual } from 'crypto';

/**
 * ── A POST-MEDIA LINK THE EDGE CAN CACHE ────────────────────────────────────
 *
 * Post media is served today as a presigned R2 URL, and that has one property
 * nobody chose: **`<account>.r2.cloudflarestorage.com` is R2's S3 API endpoint,
 * and Cloudflare does not cache it.** Presigned URLs only work on that host, so
 * every photograph in every feed page is fetched from storage, every time, from
 * wherever the bucket lives — no edge, no shared cache, nothing between the
 * bucket and a phone in another hemisphere. The signature cache added earlier
 * lets ONE browser reuse what it already has; it cannot help the first fetch,
 * and it cannot help the second citizen.
 *
 * Caching private objects on R2 means a custom domain, and a custom domain
 * means our own token instead of a presigned one. Which this app has already
 * built once: `dating/photo-link.ts` mints `<claims>.<hmac>` for exactly this
 * reason, and `GET /dating/photo/:token` serves it. This is that idea, for a
 * different surface, with one deliberate difference.
 *
 * ── THE DIFFERENCE: NO VIEWER IN THE TOKEN, AND THAT IS THE WHOLE POINT ─────
 *
 * A dating photo link names its VIEWER, so the API can re-check permission on
 * every fetch. Naming the viewer here would defeat the reason for doing any of
 * it: a per-viewer URL is a per-viewer cache key, so a thousand citizens
 * reading the same post would miss the cache a thousand times and we would
 * have bought a second architecture for nothing.
 *
 * So a post-media token names a KEY and an EXPIRY and nothing else, and every
 * viewer inside the window is handed the same string. That is not a widening:
 * a presigned URL carries no requester identity either, and `signPostMedia`
 * already caches one signed URL per key and hands it to everybody. The
 * security posture is what it is today — audience is decided when the FEED is
 * read, and the link is a bearer credential bounded by its window — with the
 * window now the only thing standing in for revocation, which is what it was
 * standing in for before.
 *
 * Domain separation is a different string from the dating one on purpose: a
 * post-media token must not be accepted by the dating photo route, or by
 * anything else, and rotating the access secret rotates both.
 *
 * Pure functions over a secret rather than a service, for the reason
 * photo-link.ts gives: a token format has to be testable without a container,
 * and the round trip, the expiry and the tamper cases are the whole of it.
 *
 * THE WORKER READS THIS FORMAT. `workers/media-edge/` verifies the same HMAC
 * with WebCrypto and serves the object from an R2 binding. Change the shape
 * here and that has to change with it — `a-link-the-edge-can-cache.spec.ts`
 * pins the format for both.
 */

const SEP = '.';

/** Domain separation: derived from the access secret, never equal to it, and
 *  never the same derivation as a dating photo link. */
function mediaKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('tc:post-media-link:v1').digest();
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', mediaKey(secret)).update(payload).digest('base64url');
}

/** `<base64url({k,e})>.<hmac>` — one string per key per window, shared by every
 *  viewer, which is what makes it cacheable. */
export function mintMediaToken(secret: string, key: string, ttlSec: number, nowMs: number): string {
  const body = Buffer.from(JSON.stringify({ k: key, e: Math.floor(nowMs / 1000) + ttlSec })).toString('base64url');
  return `${body}${SEP}${sign(secret, body)}`;
}

/**
 * The key a token names, or null.
 *
 * Null for every failure and for all of them alike — a wrong signature, a
 * mangled body and an expired link are one answer, because a caller that can
 * tell them apart is an oracle for whoever is holding the string.
 */
export function readMediaToken(secret: string, token: string, nowMs: number): string | null {
  if (typeof token !== 'string') return null;
  const cut = token.lastIndexOf(SEP);
  if (cut <= 0) return null;
  const body = token.slice(0, cut);
  const given = Buffer.from(token.slice(cut + 1), 'base64url');
  const want = Buffer.from(sign(secret, body), 'base64url');
  // Length first: timingSafeEqual throws on a mismatch rather than returning false.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { k?: unknown; e?: unknown };
    if (typeof claim.k !== 'string' || typeof claim.e !== 'number') return null;
    if (claim.e * 1000 <= nowMs) return null;
    return claim.k;
  } catch {
    return null;
  }
}

/**
 * WINDOW ROUNDING, WHICH IS WHAT ACTUALLY BUYS THE CACHE HIT.
 *
 * A token minted at 12:00:01 and one minted at 12:00:02 are different strings
 * with different expiries — different URLs, different cache keys, and a cold
 * edge for the second citizen. Rounding the expiry DOWN to a window boundary
 * means everybody who asks inside the same window is handed the identical
 * string, so the first fetch warms the edge for all of them.
 *
 * The cost is that a link minted at the end of a window is short-lived. That is
 * why the caller asks for a ttl and gets AT LEAST half of it: the boundary is
 * placed so the worst link anyone receives still has half the window on it,
 * which is the same trade `signPostMedia`'s signature cache already makes.
 */
export function windowedExpiry(ttlSec: number, nowMs: number): number {
  const half = Math.max(1, Math.floor(ttlSec / 2));
  const now = Math.floor(nowMs / 1000);
  return (Math.floor(now / half) + 2) * half;
}

/** Mint on a window boundary, so every viewer in the window gets one string. */
export function mintCacheableMediaToken(secret: string, key: string, ttlSec: number, nowMs: number): string {
  const exp = windowedExpiry(ttlSec, nowMs);
  const body = Buffer.from(JSON.stringify({ k: key, e: exp })).toString('base64url');
  return `${body}${SEP}${sign(secret, body)}`;
}
