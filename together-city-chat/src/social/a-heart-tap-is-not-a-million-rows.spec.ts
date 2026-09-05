/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { SocialService } from './social.service';
import { ReadCache } from '../shared/cache/read-cache.service';

/**
 * ── A HEART TAP IS NOT A MILLION ROWS ───────────────────────────────────────
 *
 * The 30 Aug audit put the ceiling at "~20–40 concurrent, not 500". Two things
 * put it there, and this file is the guard on the second one.
 *
 * `postRecipients` built the live-update audience for every post, like, comment
 * and share by loading the author's ENTIRE follower list out of Postgres. The
 * comment above the query said so, deliberately: "unbounded: public fan-out
 * includes every follower — same completeness rule". At ten thousand citizens
 * that is a wasteful query. At a million it is a half-million-row result set
 * built and discarded per tap, and the process runs out of memory before the
 * database runs out of patience.
 *
 * The completeness rule it invoked was answering a question nobody had asked.
 * Nobody learns about a post from a socket event — the frontend reads the feed
 * over HTTP, and as the audit found, listens to none of these events at all.
 * A citizen outside the first thousand does not miss the post; they see it on
 * their next read, exactly as they do now.
 *
 * These tests are written against the query ARGUMENTS rather than a returned
 * list, because the failure being guarded is the size of the read, and a stub
 * that returns three rows cannot tell you whether the real one would have
 * returned five hundred thousand.
 */

const AUTHOR = 'author-0';

/** A prisma stub that records every findMany it is asked to run. */
function recorder(over: { followers?: number; conns?: number } = {}) {
  const calls: Array<{ model: string; args: any }> = [];
  const followers = Array.from({ length: over.followers ?? 5 }, (_, i) => ({ followerId: `f${i}` }));
  const conns = Array.from({ length: over.conns ?? 2 }, (_, i) => ({ userOneId: AUTHOR, userTwoId: `c${i}`, relationship: null }));
  const page = <T,>(rows: T[], args: any): T[] => (typeof args?.take === 'number' ? rows.slice(0, args.take) : rows);
  return {
    calls,
    prisma: {
      follow: {
        findMany: async (args: any) => { calls.push({ model: 'follow', args }); return page(followers, args); },
      },
      connection: {
        findMany: async (args: any) => { calls.push({ model: 'connection', args }); return page(conns, args); },
      },
      post: { findUnique: async () => null },
    } as any,
  };
}

function svc(prisma: any, cache?: ReadCache) {
  const blocking = { blockedWith: async () => new Set<string>() } as any;
  return new SocialService(prisma, {} as never, {} as never, {} as never, {} as never, blocking, {} as never, undefined, cache);
}

/** Reach the private method the way the service's own callers do. */
const recipients = (s: SocialService, audience: string) =>
  (s as unknown as { postRecipients(a: string, aud: string): Promise<string[]> }).postRecipients(AUTHOR, audience);

describe('the live-update fan-out is bounded', () => {
  it('never asks Postgres for an unbounded follower list', async () => {
    const r = recorder({ followers: 10 });
    await recipients(svc(r.prisma), 'public');
    const followerReads = r.calls.filter((c) => c.model === 'follow');
    expect(followerReads.length).toBeGreaterThan(0);
    for (const call of followerReads) {
      // THE ASSERTION THIS FILE EXISTS FOR. A `take` here is the difference
      // between a thousand rows and every follower the account has.
      expect(typeof call.args.take).toBe('number');
      expect(call.args.take).toBeLessThanOrEqual(1_000);
    }
  });

  it('takes the NEWEST followers, which is the half of the cap that needs an index', async () => {
    // Ordering matters twice: a recent follower is the likeliest to have the
    // app open, and `(followeeId, createdAt DESC)` can serve this without
    // sorting every follower to return a thousand — which is the cost the cap
    // was added to avoid in the first place.
    const r = recorder();
    await recipients(svc(r.prisma), 'public');
    const call = r.calls.find((c) => c.model === 'follow');
    expect(call?.args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('bounds the connection read too', async () => {
    const r = recorder();
    await recipients(svc(r.prisma), 'public');
    for (const call of r.calls.filter((c) => c.model === 'connection')) {
      expect(typeof call.args.take).toBe('number');
    }
  });

  it('caps the audience it hands the gateway', async () => {
    const r = recorder({ followers: 50_000, conns: 10 });
    const out = await recipients(svc(r.prisma), 'public');
    expect(out.length).toBeLessThanOrEqual(1_001); // the cap, plus the author
  });

  it('asks for no followers at all on a private post', async () => {
    const r = recorder();
    const out = await recipients(svc(r.prisma), 'private');
    expect(out).toEqual([AUTHOR]);
    expect(r.calls).toHaveLength(0);
  });

  it('asks for no followers on a friends-only post — followers are not friends', async () => {
    const r = recorder();
    await recipients(svc(r.prisma), 'friends');
    expect(r.calls.filter((c) => c.model === 'follow')).toHaveLength(0);
  });
});

/**
 * ── AND THE CACHE MAY NOT BECOME A DEPENDENCY ───────────────────────────────
 *
 * read-cache.service.ts opens with that rule. These are the tests that make it
 * true rather than intended: a cache that throws on every call must be
 * indistinguishable, in every answer, from no cache at all.
 */
describe('the read cache fails open', () => {
  /** Every method rejects — a Redis that is down, at its worst. */
  const brokenCache = () => {
    const c = new ReadCache({ up: true, raw: {
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
      del: () => Promise.reject(new Error('redis down')),
    } } as any);
    return c;
  };

  it('returns the real answer when every cache call throws', async () => {
    const r = recorder({ followers: 3 });
    const out = await recipients(svc(r.prisma, brokenCache()), 'public');
    expect(out).toContain(AUTHOR);
    expect(out).toContain('f0');
  });

  it('propagates a real read failure instead of swallowing it as a miss', async () => {
    // The distinction the wrap() comment is about: a cache miss and "the
    // database refused this query" must not arrive as the same thing, or a
    // fault becomes an empty feed.
    const cache = brokenCache();
    await expect(cache.wrap('k', 30, () => Promise.reject(new Error('db refused'))))
      .rejects.toThrow('db refused');
  });

  it('does not cache at all when the TTL is zero', async () => {
    const seen: string[] = [];
    const cache = new ReadCache({ up: true, raw: {
      get: async (k: string) => { seen.push(k); return null; },
      set: async () => 'OK',
      del: async () => 1,
    } } as any);
    let produced = 0;
    await cache.wrap('k', 0, async () => { produced++; return 'v'; });
    await cache.wrap('k', 0, async () => { produced++; return 'v'; });
    expect(produced).toBe(2);
    expect(seen).toHaveLength(0);
  });

  /**
   * THE TRAP THIS ONE IS ABOUT. `JSON.stringify(new Set(['a']))` is `'{}'`.
   * The block set travels through this cache, and a block list that silently
   * comes back empty is not a slow feed — it is a blocked person reappearing
   * in the feed of whoever blocked them. Everything cached is stored as an
   * array for that reason; this asserts the round trip rather than the
   * intention.
   */
  it('round-trips a value through real JSON without losing a collection', async () => {
    const store = new Map<string, string>();
    const cache = new ReadCache({ up: true, raw: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => { store.set(k, v); return 'OK'; },
      del: async (...ks: string[]) => { ks.forEach((k) => store.delete(k)); return ks.length; },
    } } as any);

    await cache.set('blocked:x', [...new Set(['a', 'b'])], 30);
    expect(await cache.get<string[]>('blocked:x')).toEqual(['a', 'b']);

    // And the shape that would have been the bug, proved to be one.
    await cache.set('naive:x', new Set(['a', 'b']), 30);
    expect(await cache.get('naive:x')).toEqual({});
  });

  it('forgets a key when asked, so a block does not wait out the TTL', async () => {
    const store = new Map<string, string>();
    const cache = new ReadCache({ up: true, raw: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => { store.set(k, v); return 'OK'; },
      del: async (...ks: string[]) => { ks.forEach((k) => store.delete(k)); return ks.length; },
    } } as any);
    await cache.set('graph:me', ['a'], 300);
    expect(await cache.get('graph:me')).toEqual(['a']);
    await cache.drop('graph:me');
    expect(await cache.get('graph:me')).toBeUndefined();
  });

  it('treats a value written by an older shape as a miss rather than a crash', async () => {
    // The reason the namespace carries a version: a deploy does not empty
    // Redis, and the old shape is still in there answering questions.
    const cache = new ReadCache({ up: true, raw: {
      get: async () => 'not json at all',
      set: async () => 'OK',
      del: async () => 1,
    } } as any);
    expect(await cache.get('anything')).toBeUndefined();
    expect(await cache.wrap('anything', 30, async () => 'fresh')).toBe('fresh');
  });
});

/**
 * THE SOCKET ASKS THE SAME QUESTION THE FEED DOES (5 Sep). A connection who
 * unticked the Social module was out of the HTTP feed and still received
 * post:new over the socket. The fan-out reads the grant now.
 */
describe('the fan-out honours the Social grant', () => {
  it('a connection without Social is not a recipient; one with it is', async () => {
    const conns = [
      { userOneId: AUTHOR, userTwoId: 'granted', relationship: null, modulesJson: JSON.stringify(['social', 'chat']) },
      { userOneId: AUTHOR, userTwoId: 'unticked', relationship: null, modulesJson: JSON.stringify(['chat']) },
      { userOneId: 'legacy', userTwoId: AUTHOR, relationship: null, modulesJson: null },
    ];
    const prisma: any = {
      follow: { findMany: async () => [] },
      connection: { findMany: async (args: any) => { expect(args.select.modulesJson).toBe(true); return conns; } },
      post: { findUnique: async () => null },
    };
    const ids = await recipients(svc(prisma), 'friends');
    expect(ids).toContain('granted');
    expect(ids).toContain('legacy');
    expect(ids).not.toContain('unticked');
  });
});
