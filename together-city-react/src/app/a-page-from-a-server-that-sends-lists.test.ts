import { describe, it, expect } from 'vitest';
import { asPage } from '@/features/social/api';

/**
 * ── A SHAPE CHANGE IS THE WORST KIND OF DEPLOY-WINDOW BREAK ─────────────────
 *
 * Comments, Followers and Following returned bare arrays until 30 Aug and
 * return `{ items, nextCursor }` now. The web app deploys to Vercel and the API
 * to Railway INDEPENDENTLY, so there is always a window where this frontend is
 * live against the previous backend — minutes usually, longer when a build
 * queues.
 *
 * `mira-tolerates-an-older-server.test.ts` is in this repo because that window
 * has already cost a working feature once, over a single new field that was
 * made required in the same commit that added it. This is the same lesson with
 * a bigger blast radius: a missing field reads as `undefined`, but a response
 * that is an array where the code expects an object is `undefined.items` — the
 * comment thread, the followers list and the following list all throw, on every
 * post, for everyone, until the API catches up.
 *
 * So the array is still read, as a single page with nothing after it — which is
 * precisely what an unpaginated server was always saying.
 */
describe('a page can be read from a server that still sends lists', () => {
  it('reads the new shape', () => {
    expect(asPage({ items: [1, 2], nextCursor: 'c2' })).toEqual({ items: [1, 2], nextCursor: 'c2' });
  });

  it('reads a bare array as one page with no next', () => {
    // The old server's answer, in the new server's words.
    expect(asPage([1, 2, 3])).toEqual({ items: [1, 2, 3], nextCursor: null });
  });

  it('reads an empty array as an empty page, not as a missing one', () => {
    // "No comments yet" and "we could not read the comments" are different
    // sentences, and this is the boundary where they get confused.
    expect(asPage([])).toEqual({ items: [], nextCursor: null });
  });

  it('survives null and undefined without throwing', () => {
    expect(asPage(null)).toEqual({ items: [], nextCursor: null });
    expect(asPage(undefined)).toEqual({ items: [], nextCursor: null });
  });

  it('normalises a missing cursor to null rather than undefined', () => {
    // `getNextPageParam` treats undefined as "no more pages" and null as a
    // value — they are not interchangeable to React Query, so one of them has
    // to be chosen here rather than at four call sites.
    const out = asPage({ items: [1] } as never);
    expect(out.nextCursor).toBeNull();
  });
});
