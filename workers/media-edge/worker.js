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
 *      MEDIA_LINK_SECRET (its own secret, never the JWT secret — 4 Sep). The
 *      API derives the media key from it; so does this. If the API has no
 *      MEDIA_LINK_SECRET set, `scripts/print-media-link-secret.mjs` there
 *      prints the value it derives.
 *   3. Point the host at this Worker, then set MEDIA_CDN_BASE on the API to
 *      that origin. Until you do, the API keeps minting presigned URLs and
 *      nothing changes — see `postMediaUrl` in storage.provider.ts.
 *
 * DO NOT turn on Tiered Cache for this host expecting it to help: `cache.put`
 * is documented as incompatible with tiered caching. Cloudflare's own advice
 * to pair Smart Tiered Cache with R2 is for a PUBLIC bucket served straight
 * off a custom domain, where the edge fetches over the network and there is an
 * upper tier to put near the bucket. This Worker reads through an R2 BINDING
 * and stores what it read itself, so there is no fetch for a tier to sit in
 * front of. Advice for a neighbouring architecture, which is how the first
 * draft of this file ended up recommending CloudFront on Cloudflare.
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

/**
 * The key a token names AND when it stops naming it, or null — one answer for
 * every kind of failure.
 *
 * The expiry is returned because the cache lifetime is derived from it. A
 * fixed year would have been a claim about a URL that stops working in an
 * hour, and a cache is entitled to believe it.
 */
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
    return { key: claim.k, exp: claim.e };
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

    const now = Date.now();
    const claim = await readToken(env.LINK_SECRET, token, now);
    // 404, never 403: a link that says "this exists but you may not have it"
    // tells whoever is holding the string that they found something.
    if (!claim) return new Response('Not found', { status: 404 });
    const { key, exp } = claim;

    /* THE CACHE KEY IS THE TOKEN, and that is safe BECAUSE the token is the
       same string for every viewer inside the window (see media-link.ts). A
       per-viewer token would make this a per-viewer cache entry, which is the
       cache doing nothing at a cost. */
    const cache = caches.default;
    const hit = await cache.match(request);
    if (hit) {
      /* SAID OUT LOUD, because nothing else says it. `cf-cache-status` is
         documented for Cloudflare's ordinary cache path, and the Cache API's
         behaviour for that header is not — so a deploy verified by looking for
         `cf-cache-status: HIT` is a deploy verified against a guess. This
         header is the Worker's own answer about its own cache, which is the
         only thing here that actually knows. */
      const seen = new Response(hit.body, hit);
      seen.headers.set('x-tc-cache', 'hit');
      return seen;
    }

    const object = await env.MEDIA.get(key, {
      range: request.headers.get('range') ?? undefined,
    });
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    /* PUBLIC, AND ONLY UNTIL THE TOKEN DIES. (Corrected 1 Sep, against the
       docs rather than against my memory of them.)
       
       It said `private, max-age=31536000`, over a comment claiming that
       Cloudflare's cache is filled by the explicit `cache.put` below "so the
       two do not fight". They fight. `cache.put` returns 413 and stores
       NOTHING when Cache-Control instructs a shared cache not to cache, and
       `private` is exactly that instruction. The put sits in `waitUntil`, so
       the refusal would have been silent: every request a miss, every
       photograph read from the bucket again, a Worker invocation added to the
       bill for it, and a comment above the line explaining why that could not
       be happening.

       `public` here does not widen who may see a photograph, and the spec that
       argued it would (`is private, because these are private-bucket objects`)
       is right about the OTHER door. Two doors, two answers:

         · The object's stored Cache-Control, written by putPrivateObject, is
           `private` and stays `private`. That governs the S3 path, where the
           URL is presigned per request and a shared cache keeping it would be
           keeping something not everyone holding the URL may have.
         · This response is reached only by presenting a token — the same
           string for every viewer inside the window, checked BEFORE the cache
           is consulted. A proxy that stores it can serve it only to somebody
           presenting that same token, which is somebody who already has the
           credential. That is exactly what the presigned URL this replaces
           was: a bearer link, cacheable by whoever holds it.

       The year had to go with it. `max-age` is now what is LEFT of the token,
       so no cache anywhere outlives the URL's own validity — which a year on
       an hour-long token invited it to do. `immutable` stays true: the key is
       a uuid written once, and a changed photograph is a new key. */
    const ttl = Math.max(0, exp - Math.floor(now / 1000));
    headers.set('cache-control', `public, max-age=${ttl}, immutable`);
    // A range request answers 206 and must not be cached as if it were whole.
    const ranged = object.range !== undefined && request.headers.has('range');
    if (ranged) {
      headers.set('content-range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    }
    headers.set('accept-ranges', 'bytes');

    headers.set('x-tc-cache', 'miss');
    const res = new Response(object.body, { status: ranged ? 206 : 200, headers });
    /* Only whole responses go in the edge cache; a 206 is one reader's window,
       and `cache.put` throws on one outright. A rejected put is otherwise
       invisible in `waitUntil` — see the Cache-Control note above for what
       that hid — so a failure says so in the log rather than turning into a
       cache that is quietly always cold. */
    if (!ranged) {
      ctx.waitUntil(
        cache.put(request, res.clone()).catch((err) => {
          console.error('media-edge: cache.put refused', key, String(err));
        }),
      );
    }
    return res;
  },
};
