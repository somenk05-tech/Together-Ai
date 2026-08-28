import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mintPhotoToken, readPhotoToken } from './photo-link';

/**
 * ── A PHOTO LINK HAS TO OUTLIVE THE PAGE THAT HOLDS IT ──
 *
 * The dating photo link carried a sixty-second expiry, inherited from the
 * presigned era where the expiry WAS the revocation. The proxy route runs
 * mayViewPhoto on every fetch, so revocation no longer depends on it — but the
 * sixty seconds stayed, and the web app caches responses for five minutes and
 * lazy-loads every photograph. A render from cache, or a scroll that reaches a
 * card a minute later, asked for a link that had died. The route answers 404
 * for every refusal alike, so the visitor got a broken frame and the log got
 * nothing.
 *
 * Two things pinned: the arithmetic of expiry itself, and that the minted
 * window stays larger than the client cache it has to survive.
 */
const CLIENT_CACHE_MS = 5 * 60_000;  // together-city-react/src/api/queryClient.ts, gcTime

describe('a link that outlives the page', () => {
  const secret = 'a'.repeat(40);
  const key = 'dating/user-1/abc.jpg';

  it('reads back inside its window and is refused one second past it', () => {
    const t0 = 1_700_000_000_000;
    const token = mintPhotoToken(secret, 'viewer-1', key, 600, t0);
    expect(readPhotoToken(secret, token, t0 + 599_000)).toEqual({ viewerId: 'viewer-1', key });
    expect(readPhotoToken(secret, token, t0 + 601_000)).toBeNull();
  });

  it('is refused the moment it is minted when the window is zero', () => {
    const t0 = 1_700_000_000_000;
    expect(readPhotoToken(secret, mintPhotoToken(secret, 'v', key, 0, t0), t0)).toBeNull();
  });

  /**
   * The regression this file exists for. A window shorter than the cache means
   * a photograph that was fetched legitimately, is still permitted, and still
   * cannot be shown.
   */
  it('mints a window longer than the client keeps the response', () => {
    const src = readFileSync(join(__dirname, '..', 'media', 'storage.provider.ts'), 'utf8');
    const proxy = /proxyPhotoTtlSec = (\d+)/.exec(src);
    expect(proxy).not.toBeNull();
    expect(Number(proxy![1]) * 1000).toBeGreaterThan(CLIENT_CACHE_MS);
    // The presigned fallback keeps the short window on purpose: there the
    // expiry is the whole of the revocation.
    expect(src).toMatch(/datingPhotoTtlSec = 60\b/);
  });
});
