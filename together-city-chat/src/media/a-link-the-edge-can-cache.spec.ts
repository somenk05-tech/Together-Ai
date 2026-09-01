/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mintMediaToken, readMediaToken, mintCacheableMediaToken, windowedExpiry } from './media-link';
import { mintPhotoToken, readPhotoToken } from '../dating/photo-link';
import { StorageProvider } from './storage.provider';

/**
 * ── A LINK THE EDGE CAN CACHE ───────────────────────────────────────────────
 *
 * The finding, which took reading the deployment rather than the code: this app
 * stores media in **Cloudflare R2**, not S3 (`S3_ENDPOINT=…r2.cloudflarestorage
 * .com`, `forcePathStyle: true`). And presigned R2 URLs only work on that S3
 * API host, which **Cloudflare does not cache**. So every photograph in every
 * feed page was fetched from storage on every request, with no edge in between
 * — and the earlier signature cache, which lets ONE browser reuse what it has,
 * could do nothing about the first fetch or the second citizen.
 *
 * Caching a private R2 bucket means a custom domain, and a custom domain means
 * our own token. `workers/media-edge` is the door; this is the key.
 *
 * ── WHAT THESE TESTS ARE REALLY FOR ─────────────────────────────────────────
 *
 * Two things, and the second is the one that will break first.
 *
 *  · The token behaves: round trip, expiry, tamper, domain separation.
 *  · THE TWO IMPLEMENTATIONS AGREE. The format is written twice — once in
 *    TypeScript for the API, once in JavaScript with WebCrypto for the Worker,
 *    because a Worker cannot import from `src/`. Two copies of a wire format is
 *    a thing that drifts, and when it drifts every photograph 404s. So the
 *    constants that MUST match are asserted against the Worker's own source.
 */

const SECRET = 'test-access-secret';
const KEY = 'social/me-0000/a.jpg';
const NOW = 1_700_000_000_000;

describe('a post-media token names a key and an expiry, and nothing else', () => {
  it('round-trips the key', () => {
    const t = mintMediaToken(SECRET, KEY, 3600, NOW);
    expect(readMediaToken(SECRET, t, NOW)).toBe(KEY);
  });

  it('is null once it has expired', () => {
    const t = mintMediaToken(SECRET, KEY, 60, NOW);
    expect(readMediaToken(SECRET, t, NOW + 61_000)).toBeNull();
  });

  it('is null for a tampered body, a tampered signature, and rubbish', () => {
    const t = mintMediaToken(SECRET, KEY, 3600, NOW);
    const [body, sig] = t.split('.');
    const otherBody = Buffer.from(JSON.stringify({ k: 'social/them/secret.jpg', e: 9e9 })).toString('base64url');
    expect(readMediaToken(SECRET, `${otherBody}.${sig}`, NOW)).toBeNull();
    expect(readMediaToken(SECRET, `${body}.${sig.slice(0, -2)}xx`, NOW)).toBeNull();
    expect(readMediaToken(SECRET, 'nonsense', NOW)).toBeNull();
    expect(readMediaToken(SECRET, '', NOW)).toBeNull();
    expect(readMediaToken(SECRET, t, NOW)).toBe(KEY); // …and the real one still works
  });

  it('is null under a different secret', () => {
    const t = mintMediaToken(SECRET, KEY, 3600, NOW);
    expect(readMediaToken('another-secret', t, NOW)).toBeNull();
  });

  it('cannot be swapped with a dating photo link, in either direction', () => {
    // Different domain separation, so a leaked post-media link cannot be
    // replayed at the dating route and vice versa — even though both are
    // derived from the same access secret.
    const post = mintMediaToken(SECRET, KEY, 3600, NOW);
    const dating = mintPhotoToken(SECRET, 'viewer-1', KEY, 3600, NOW);
    expect(readPhotoToken(SECRET, post, NOW)).toBeNull();
    expect(readMediaToken(SECRET, dating, NOW)).toBeNull();
  });
});

describe('every viewer in a window gets the same string, which is the point', () => {
  /**
   * A token minted a second later is a different string, a different URL and a
   * cold edge for the second citizen. Rounding the expiry to a window boundary
   * is what turns this from a private link into a cacheable one.
   */
  it('mints one identical token across a whole window', () => {
    const a = mintCacheableMediaToken(SECRET, KEY, 3600, NOW);
    const b = mintCacheableMediaToken(SECRET, KEY, 3600, NOW + 1_000);
    const c = mintCacheableMediaToken(SECRET, KEY, 3600, NOW + 60_000);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('still hands out a usable link at the very end of a window', () => {
    // The worst link anyone receives must not expire in their hand. The
    // boundary is placed so it always has at least half the window left.
    const half = 1800;
    const endOfWindow = (Math.floor(NOW / 1000 / half) + 1) * half * 1000 - 1;
    const t = mintCacheableMediaToken(SECRET, KEY, 3600, endOfWindow);
    expect(readMediaToken(SECRET, t, endOfWindow)).toBe(KEY);
    expect(readMediaToken(SECRET, t, endOfWindow + half * 1000)).toBe(KEY);
  });

  it('does eventually expire', () => {
    const t = mintCacheableMediaToken(SECRET, KEY, 3600, NOW);
    expect(readMediaToken(SECRET, t, NOW + 2 * 3600 * 1000)).toBeNull();
    expect(windowedExpiry(3600, NOW) * 1000).toBeGreaterThan(NOW);
  });
});

describe('the API and the Worker read the same format', () => {
  /**
   * The format lives twice — TypeScript here, WebCrypto in the Worker, because
   * a Worker cannot import from `src/`. Two copies of a wire format drift, and
   * when this one drifts every photograph in the city 404s at once. These are
   * the constants that must match.
   */
  const worker = readFileSync(join(__dirname, '..', '..', '..', 'workers', 'media-edge', 'worker.js'), 'utf8');
  const lib = readFileSync(join(__dirname, 'media-link.ts'), 'utf8');

  it('uses the same domain-separation string on both sides', () => {
    expect(lib).toContain("'tc:post-media-link:v1'");
    expect(worker).toContain("'tc:post-media-link:v1'");
  });

  it('uses the same separator and the same claim names', () => {
    expect(worker).toMatch(/const SEP = '\.';/);
    expect(worker).toMatch(/claim\.k/);
    expect(worker).toMatch(/claim\.e/);
  });

  it('derives the signing key the same way — never the raw secret', () => {
    // HMAC(secret, DOMAIN) is the key that signs the body, on both sides.
    expect(lib).toMatch(/createHmac\('sha256', secret\)\.update\('tc:post-media-link:v1'\)/);
    expect(worker).toMatch(/hmac\(enc\.encode\(secret\), DOMAIN\)/);
  });

  it('answers 404 rather than 403 for a bad token', () => {
    // A 403 tells whoever is holding the string that they found something real.
    expect(worker).toMatch(/if \(!claim\) return new Response\('Not found', \{ status: 404 \}\)/);
    expect(worker).not.toMatch(/status: 403/);
  });

  /**
   * ── THE HEADER THAT WOULD HAVE MADE THE CACHE A NO-OP (1 Sep) ────────────
   *
   * The response the Worker stores said `Cache-Control: private`, over a
   * comment asserting that Cloudflare's cache is filled by the explicit
   * `cache.put` "so the two do not fight". They fight. `cache.put` returns
   * 413 and stores nothing when Cache-Control instructs a shared cache not to
   * cache, and the put sits inside `waitUntil`, so the refusal is silent:
   * every request a miss, every photograph read from the bucket again, a
   * Worker invocation added to the bill for it, and a comment above the line
   * explaining why that was impossible.
   *
   * Nothing was red, and nothing could have been — no test looked at the
   * header, and the one that verified the token would have passed against a
   * cache that never held anything. This is that test.
   */
  it('stores a response a shared cache is allowed to keep', () => {
    const stored = worker.slice(worker.indexOf("headers.set('cache-control'"));
    expect(stored).toMatch(/headers\.set\('cache-control', `public, max-age=\$\{ttl\}, immutable`\)/);
    // The word, specifically. `private` here is the whole defect.
    expect(worker).not.toMatch(/'private[^']*'\)/);
  });

  it('does not hide a refused put inside waitUntil', () => {
    // A cache write that fails must say so. It was the silence that made the
    // header above survivable in the first place.
    expect(worker).toMatch(/cache\.put\(request, res\.clone\(\)\)\.catch\(/);
  });

  it('answers for its own cache, rather than leaning on cf-cache-status', () => {
    // `cf-cache-status` is documented for Cloudflare's ordinary cache path;
    // what the Cache API does with it is not. A deploy checked by grepping for
    // HIT would have been a deploy checked against a guess — including on the
    // `workers.dev` URL, where the Cache API does not work at all.
    expect(worker).toMatch(/x-tc-cache', 'hit'/);
    expect(worker).toMatch(/x-tc-cache', 'miss'/);
  });

  it('never caches a range response, which the Cache API refuses outright', () => {
    // `cache.put` throws on a 206. It is also simply wrong — a 206 is one
    // reader's window, not the object.
    expect(worker).toMatch(/if \(!ranged\) \{/);
    expect(worker).toMatch(/status: ranged \? 206 : 200/);
  });
});

describe('the Worker\'s own code reads a token this API minted', () => {
  /**
   * The strongest version of the previous block. Those assertions pin the
   * CONSTANTS; this one runs the Worker's actual verification against a token
   * produced by the API's actual minting, so a divergence in the algorithm —
   * a different hash, a different derivation, a base64url edge case — fails
   * here rather than as every photograph 404-ing after a deploy.
   *
   * `worker.js` is plain JavaScript over globals a Worker and Node both have
   * (`crypto.subtle`, `atob`, `TextEncoder`). Cutting the `export default`
   * block off the end leaves the helpers, which can then be evaluated and
   * called. If the file's shape changes enough that this cannot find
   * `readToken`, that is a failure worth having.
   */
  const src = readFileSync(join(__dirname, '..', '..', '..', 'workers', 'media-edge', 'worker.js'), 'utf8');
  const helpers = src.slice(0, src.indexOf('export default'));

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const workerRead = new Function(`${helpers}; return readToken;`)() as
    (secret: string, token: string, nowMs: number) => Promise<string | null>;

  it('finds the Worker’s verifier at all', () => {
    // A cut that produced nothing would make every assertion below vacuous.
    expect(helpers).toContain('async function readToken');
    expect(typeof workerRead).toBe('function');
  });

  it('accepts a token the API minted', async () => {
    const t = mintCacheableMediaToken(SECRET, KEY, 3600, Date.now());
    await expect(workerRead(SECRET, t, Date.now())).resolves.toMatchObject({ key: KEY });
  });

  it('rejects an expired one', async () => {
    const t = mintMediaToken(SECRET, KEY, 60, NOW);
    await expect(workerRead(SECRET, t, NOW + 61_000)).resolves.toBeNull();
  });

  it('rejects a different secret', async () => {
    const t = mintMediaToken(SECRET, KEY, 3600, Date.now());
    await expect(workerRead('another-secret', t, Date.now())).resolves.toBeNull();
  });

  it('rejects a body swapped onto a valid signature', async () => {
    // The forgery that matters: keep the signature, point the claim at
    // somebody else's object.
    const t = mintMediaToken(SECRET, KEY, 3600, Date.now());
    const sig = t.slice(t.lastIndexOf('.') + 1);
    const forged = Buffer.from(JSON.stringify({ k: 'social/them/secret.jpg', e: 9e9 })).toString('base64url');
    await expect(workerRead(SECRET, `${forged}.${sig}`, Date.now())).resolves.toBeNull();
  });

  it('rejects a dating photo token, which is signed with the same secret', async () => {
    const dating = mintPhotoToken(SECRET, 'viewer-1', KEY, 3600, Date.now());
    await expect(workerRead(SECRET, dating, Date.now())).resolves.toBeNull();
  });
});

describe('no edge configured changes nothing', () => {
  /**
   * The fallback is the same promise `datingPhotoUrl` makes: setting the
   * variable turns the edge on, and not setting it leaves every citizen with
   * exactly the behaviour they had. A mistyped variable must not take every
   * photograph in the city off the screen.
   */
  const provider = (cdnBase: string) => {
    const p = Object.create(StorageProvider.prototype) as StorageProvider;
    (p as any).cdnBase = cdnBase;
    (p as any).linkSecret = SECRET;
    (p as any).healthBucket = 'hb';
    (p as any).postMediaTtlSec = 3600;
    (p as any).logger = { warn: () => undefined, error: () => undefined, log: () => undefined };
    (p as any).isPostKey = (k: string) => k.startsWith('social/');
    (p as any).cache = undefined;
    (p as any).s3 = null; // no S3 → the presigned path returns its own fallback
    return p;
  };

  it('mints an edge URL when MEDIA_CDN_BASE is set', async () => {
    const out = await provider('https://media.example').signPostMedia([KEY]);
    const url = out.get(KEY) ?? '';
    expect(url.startsWith('https://media.example/m/')).toBe(true);
    // …and the token in it really names the key.
    const token = decodeURIComponent(url.slice('https://media.example/m/'.length));
    expect(readMediaToken(SECRET, token, Date.now())).toBe(KEY);
  });

  it('does not mint one when it is unset', async () => {
    const out = await provider('').signPostMedia([KEY]);
    expect(out.get(KEY) ?? '').not.toContain('/m/');
  });

  it('does not mint one when the secret is missing, rather than signing with nothing', async () => {
    const p = provider('https://media.example');
    (p as any).linkSecret = '';
    const out = await p.signPostMedia([KEY]);
    expect(out.get(KEY) ?? '').not.toContain('/m/');
  });
});
