/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { SocialService } from './social.service';

/**
 * ── AN AUDIENCE IS NOT A FOLLOW (30 Aug audit, blockers 1 and 2) ─────────────
 *
 * The audit found the load-bearing promise of this hub unenforced and, worse,
 * untested: nothing anywhere called `feed()`, `repost()`, `assertCanView()` or
 * exercised block enforcement. Every guard was written thoughtfully and then
 * routed around by a feature added later, and the build stayed green through
 * all of it.
 *
 * Two defects, both shipped:
 *
 *   1. `friends` was gated on `networkIds` — yourself plus everyone you FOLLOW.
 *      Following is unilateral. So pressing Follow on somebody handed you their
 *      entire friends-audience history, while the composer told the author
 *      "Friends — Your accepted connections".
 *
 *   2. A repost row was written `audience: 'public'` unconditionally, and the
 *      feed renders the ORIGINAL through it. One tap published a friends-only
 *      post to the whole city; reposting your own `private` post published that.
 *
 * WHAT THIS FILE ASSERTS, AND WHAT IT CANNOT.
 *
 * `repost`, `follow` and `deletePost` are called for real against an in-memory
 * Prisma, and asserted on what they write and refuse — the style
 * `a-dating-id-buys-you-nothing.spec.ts` argues for, and the reason that file's
 * docstring is worth reading before adding another regex spec here.
 *
 * `feed()` is different and the difference is stated rather than hidden: this
 * spec captures the `where` OBJECT the service hands to Prisma and asserts on
 * it. It does NOT execute the query. So it proves the friends branch is gated
 * on the circle rather than the follow graph — which is the whole of defect 1 —
 * and it would NOT catch a Prisma bug in how that where is executed. Faking the
 * query engine well enough to run it is a bigger lie than saying this plainly.
 */

const ME = 'me-0000';
const CONNECTED = 'conn-1111';
const FOLLOWED = 'foll-2222';
const BLOCKED = 'blok-3333';

/** Captures what `feed()` asked Prisma for. */
function feedStub(opts: { follows: string[]; connections: string[]; blocked: string[] }) {
  const seen: any[] = [];
  const prisma = {
    follow: { findMany: async () => opts.follows.map((id) => ({ followeeId: id })) },
    connection: {
      findMany: async () => opts.connections.map((id) => ({ userOneId: ME, userTwoId: id, relationship: null })),
    },
    post: {
      findMany: async (args: any) => { seen.push(args); return []; },
      findUnique: async () => null,
    },
  } as any;
  const blocking = { blockedWith: jest.fn(async () => new Set(opts.blocked)) } as any;
  const connections = { visibleAudiences: jest.fn(async () => ['friends']) } as any;
  // Post media is a private key signed on read (30 Aug), so every read path
  // goes through the storage provider now.
  const storage = { signPostMedia: jest.fn(async () => new Map<string, string>()) } as any;
  const svc = new SocialService(prisma, {} as never, {} as never, storage, connections, blocking, {} as never);
  return { svc, seen };
}

/** Every OR branch in the audience gate, flattened, whatever it is nested in. */
function audienceBranches(where: any): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.AND)) node.AND.forEach(walk);
    if (Array.isArray(node.OR)) out.push(...node.OR);
  };
  walk(where);
  return out;
}

describe('a friends-audience post is for the circle, not for the follow graph', () => {
  it('gates `friends` on accepted connections and not on who you follow', async () => {
    const { svc, seen } = feedStub({ follows: [FOLLOWED], connections: [CONNECTED], blocked: [] });
    await svc.feed(ME, { limit: 20 } as any);
    const friends = audienceBranches(seen[0].where).find((b) => b.audience === 'friends');
    expect(friends).toBeDefined();
    // The set is the connection, and the person merely followed is NOT in it.
    // Before the fix this array was `networkIds` and contained both.
    expect(friends.authorId.in).toContain(CONNECTED);
    expect(friends.authorId.in).not.toContain(FOLLOWED);
  });

  it('never lets a bare `friends` branch through with no author bound at all', async () => {
    // The bounded lenses read `{ audience: { in: ['public','friends'] } }`,
    // which is every friends post in the city until an outer clause happens to
    // narrow it. A branch naming `friends` must always name its authors too.
    for (const filter of ['photos', 'thoughts', 'foryou']) {
      const { svc, seen } = feedStub({ follows: [FOLLOWED], connections: [CONNECTED], blocked: [] });
      await svc.feed(ME, { limit: 20, filter } as any);
      for (const b of audienceBranches(seen[0].where)) {
        const names = Array.isArray(b.audience?.in) ? b.audience.in : [b.audience];
        if (names.includes('friends')) expect(b.authorId).toBeDefined();
      }
    }
  });

  it('keeps blocked authors out of the Following lens, which replaces the network set', async () => {
    const { svc, seen } = feedStub({ follows: [FOLLOWED, BLOCKED], connections: [], blocked: [BLOCKED] });
    await svc.feed(ME, { limit: 20, filter: 'following' } as any);
    expect(seen[0].where.authorId.in).toEqual([FOLLOWED]);
    expect(seen[0].where.authorId.notIn).toContain(BLOCKED);
  });

  it('asks for one authorId constraint, not two spreads where the second wins', async () => {
    // Written as two conditional spreads the block filter is silently replaced
    // by the network filter. This asserts the shape, because the failure is
    // invisible in a rendered feed and total in effect.
    const { svc, seen } = feedStub({ follows: [FOLLOWED], connections: [], blocked: [BLOCKED] });
    await svc.feed(ME, { limit: 20, filter: 'following' } as any);
    const a = seen[0].where.authorId;
    expect(Object.keys(a).sort()).toEqual(['in', 'notIn']);
  });

  it('excludes reposts whose original was removed or whose author you blocked', async () => {
    const { svc, seen } = feedStub({ follows: [], connections: [], blocked: [BLOCKED] });
    await svc.feed(ME, { limit: 20 } as any);
    const branches = (seen[0].where.AND ?? []).flatMap((n: any) => n.OR ?? []);
    const repostBranch = branches.find((b: any) => b.repostOf);
    expect(repostBranch).toBeDefined();
    expect(repostBranch.repostOf.is.moderation).toBe('visible');
    expect(repostBranch.repostOf.is.authorId.notIn).toContain(BLOCKED);
    // …and a row that is not a repost is still allowed through.
    expect(branches.some((b: any) => b.repostOfId === null)).toBe(true);
  });
});

// ─────────────────────────── repost ───────────────────────────

function repostStub(original: Record<string, unknown>) {
  const created: any[] = [];
  const prisma = {
    post: {
      findUnique: async () => original,
      findFirst: async () => null,
      create: async (args: any) => {
        created.push(args.data);
        // Shaped like the row the real `include` returns: a repost carries the
        // ORIGINAL under `repostOf`, and that is the half `shapeFeedRow` renders.
        return {
          ...args.data, id: 'new', createdAt: new Date(), media: [],
          author: { name: 'Me', handle: 'me' }, _count: { likes: 0, comments: 0 }, likes: [],
          repostOf: {
            ...original, createdAt: new Date(), media: [],
            author: { id: 'author', name: 'Author', handle: 'author', profileImage: null },
            _count: { likes: 0, comments: 0 }, likes: [],
          },
        };
      },
    },
    connection: { findMany: async () => [] },
    follow: { findMany: async () => [] },
    user: { findUnique: async () => ({ name: 'Me' }) },
  } as any;
  const blocking = { blockedWith: jest.fn(async () => new Set<string>()) } as any;
  const connections = { visibleAudiences: jest.fn(async () => ['friends', 'family']) } as any;
  const gateway = { postNew: jest.fn() } as any;
  const notifications = { create: jest.fn(async () => undefined) } as any;
  const storage = { signPostMedia: jest.fn(async () => new Map<string, string>()) } as any;
  const svc = new SocialService(prisma, gateway, notifications, storage, connections, blocking, {} as never);
  return { svc, created };
}

describe('a share cannot widen the audience it shares', () => {
  it('inherits the original audience instead of forcing public', async () => {
    const { svc, created } = repostStub({ id: 'p1', authorId: 'author', audience: 'friends', moderation: 'visible', repostOfId: null });
    await svc.repost(ME, 'p1');
    expect(created[0].audience).toBe('friends');
  });

  it('refuses to share a private post, including the author’s own', async () => {
    const { svc, created } = repostStub({ id: 'p1', authorId: ME, audience: 'private', moderation: 'visible', repostOfId: null });
    await expect(svc.repost(ME, 'p1')).rejects.toThrow(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('refuses to share a removed post', async () => {
    const { svc, created } = repostStub({ id: 'p1', authorId: 'author', audience: 'public', moderation: 'removed', repostOfId: null });
    await expect(svc.repost(ME, 'p1')).rejects.toThrow(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('refuses a share of a share, which rendered as an empty card', async () => {
    const { svc, created } = repostStub({ id: 'p1', authorId: 'author', audience: 'public', moderation: 'visible', repostOfId: 'p0' });
    await expect(svc.repost(ME, 'p1')).rejects.toThrow(ForbiddenException);
    expect(created).toHaveLength(0);
  });
});

// ─────────────────────────── follow & delete ───────────────────────────

describe('a block survives a re-follow, and a delete reaches the bucket', () => {
  it('refuses a follow when either side has blocked the other', async () => {
    const written: any[] = [];
    const prisma = {
      user: { findFirst: async () => ({ id: BLOCKED }) },
      follow: { findUnique: async () => null, createMany: async (a: any) => { written.push(a); return { count: 1 }; } },
    } as any;
    const blocking = { blockedWith: jest.fn(async () => new Set([BLOCKED])) } as any;
    const svc = new SocialService(prisma, {} as never, {} as never, {} as never, {} as never, blocking, {} as never);
    await expect(svc.follow(ME, 'mallory')).rejects.toThrow(ForbiddenException);
    expect(written).toHaveLength(0);
  });

  it('deletes the stored objects behind a deleted post — the private keys and the legacy public ones', async () => {
    const deleted: string[] = [];
    const prisma = {
      post: { findUnique: async () => ({ id: 'p1', authorId: ME, audience: 'public' }), delete: async () => ({}) },
      postMedia: {
        findMany: async () => [
          // The shape written since 30 Aug: a private key.
          { url: `social/${ME}/new.mp4`, thumbUrl: `social/${ME}/new.jpg` },
          // And the two shapes already in the table — a permanent public URL,
          // which is exactly the file that most needs deleting, and an inline
          // photograph, which has no object behind it at all.
          { url: 'https://cdn.example/abc.mp4', thumbUrl: 'https://cdn.example/abc.jpg' },
          { url: 'data:image/jpeg;base64,AAAA', thumbUrl: null },
        ],
      },
      connection: { findMany: async () => [] },
      follow: { findMany: async () => [] },
    } as any;
    const storage = {
      isPostKey: (v: string) => /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(v),
      keyFromUrl: (u: string) => (u.startsWith('https://cdn.example/') ? u.slice('https://cdn.example/'.length) : ''),
      deleteObject: jest.fn(async (k: string) => { deleted.push(`public:${k}`); }),
      deletePrivateObject: jest.fn(async (k: string) => { deleted.push(`private:${k}`); }),
    } as any;
    const blocking = { blockedWith: jest.fn(async () => new Set<string>()) } as any;
    const gateway = { postDeleted: jest.fn() } as any;
    const svc = new SocialService(prisma, gateway, {} as never, storage, {} as never, blocking, {} as never);
    await svc.deletePost(ME, 'p1');
    await new Promise((r) => setImmediate(r)); // the object deletes are best-effort
    expect(deleted.sort()).toEqual([
      'private:social/me-0000/new.jpg', 'private:social/me-0000/new.mp4',
      'public:abc.jpg', 'public:abc.mp4',
    ]);
  });
});
