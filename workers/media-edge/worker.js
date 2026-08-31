/**
 * ── THE EDGE THAT SERVES POST MEDIA ─────────────────────────────────────────
 *
 * Why this exists, in one paragraph: presigned R2 URLs only work on
 * `<account>.r2.cloudflarestorage.com`, which is R2's S3 API endpoint, and
 * Cloudflare does not cache that host. So every photograph in every feed page
 * was fetched from storage on every request, from wherever the bucket lives,
 * with nothing between it and a phone in another hemisphere. Caching a PRIVATE
 * R2 bucket means a custom domain, and a custom domain means our own token
 * instead of a presigned one.
 *
 * This Worker is the other half of `src/media/media-link.ts`. It verifies the
 * same HMAC — same derivation string, same `<base64url({k,e})>.<hmac>` shape —
 * and serves the object straight from an R2 binding. The API never touches the
 * bytes: no Node process in the path, no egress bill, and a cache hit for every
 * citizen after the first.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * It does not know who is asking, and it must not pretend to. Audience is
 * decided when the FEED is read, by the API, against live rows; this serves a
 * bearer link bounded by its window, which is exactly what the presigned URL it
 * replaces did. A token names a key and an expiry and no viewer — deliberately,
 * because a per-viewer URL is a per-viewer cache key and would defeat the whole
 * exercise. See the long note in media-link.ts.
 *
 * ── DEPLOY ──────────────────────────────────────────────────────────────────
 *
 *   1. wrangler.toml here binds MEDIA (your PRIVATE bucket) and the route.
 *   2. `wrangler secret put LINK_SECRET`  — the SAME value as the API's
 *      JWT_ACCESS_SECRET. The API derives the media key from it; so does this.
 *   3. Point the custom domain at this Worker, then set MEDIA_CDN_BASE on the
 *      API to that origin. Until you do, the API keeps minting presigned URLs
 *      and nothing changes — see `postMediaUrl` in storage.provider.ts.
 *
 * Leave the bucket PRIVATE. This Worker is the only public door, and it opens
 * only for a token this app signed.
 */

const SEP = '.';
const DOMAIN = 'tc:post-media-link:v1';

const enc = new TextEncoder();

/** base64url → bytes, without the padding Node adds and the browser rejects. */
function fromB64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toB64Url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(keyBytes, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

/** The same two-step derivation the API does: HMAC(secret, DOMAIN) is the key
 *  that signs the body. Never the access secret itself. */
async function mediaKey(secret) {
  return hmac(enc.encode(secret), DOMAIN);
}

/** Constant-time compare. `crypto.subtle.verify` would do, but this keeps the
 *  shape identical to the API's `timingSafeEqual` check. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** The key a token names, or null — one answer for every kind of failure. */
async function readToken(secret, token, nowMs) {
  if (typeof token !== 'string') return null;
  const cut = token.lastIndexOf(SEP);
  if (cut <= 0) return null;
  const body = token.slice(0, cut);
  const given = fromB64Url(token.slice(cut + 1));
  const want = await hmac(await mediaKey(secret), body);
  if (!sameBytes(given, want)) return null;
  try {
    const claim = JSON.parse(new TextDecoder().decode(fromB64Url(body)));
    if (typeof claim.k !== 'string' || typeof claim.e !== 'number') return null;
    if (claim.e * 1000 <= nowMs) return null;
    return claim.k;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    // /m/<token>
    const token = decodeURIComponent(url.pathname.replace(/^\/m\//, ''));
    if (!token || token === url.pathname) return new Response('Not found', { status: 404 });

    const key = await readToken(env.LINK_SECRET, token, Date.now());
    // 404, never 403: a link that says "this exists but you may not have it"
    // tells whoever is holding the string that they found something.
    if (!key) return new Response('Not found', { status: 404 });

    /* THE CACHE KEY IS THE TOKEN, and that is safe BECAUSE the token is the
       same string for every viewer inside the window (see media-link.ts). A
       per-viewer token would make this a per-viewer cache entry, which is the
       cache doing nothing at a cost. */
    const cache = caches.default;
    const hit = await cache.match(request);
    if (hit) return hit;

    const object = await env.MEDIA.get(key, {
      range: request.headers.get('range') ?? undefined,
    });
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    /* A YEAR, PRIVATE, IMMUTABLE. The key is a uuid written once and never
       rewritten — a changed photograph is a new key — so `immutable` is a fact
       here rather than a hope. `private` keeps it out of any shared proxy
       between us and the citizen; Cloudflare's own cache is populated by the
       explicit put below rather than by this header, so the two do not fight. */
    headers.set('cache-control', 'private, max-age=31536000, immutable');
    // A range request answers 206 and must not be cached as if it were whole.
    const ranged = object.range !== undefined && request.headers.has('range');
    if (ranged) {
      headers.set('content-range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    }
    headers.set('accept-ranges', 'bytes');

    const res = new Response(object.body, { status: ranged ? 206 : 200, headers });
    // Only whole responses go in the edge cache; a 206 is one reader's window.
    if (!ranged) ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
};
