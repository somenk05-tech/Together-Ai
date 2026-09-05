/* eslint-disable @typescript-eslint/no-explicit-any */
import { SocialService } from './social.service';

/**
 * ── A SAVED POST IS A ROW, NOT A SNAPSHOT ───────────────────────────────────
 *
 * The 4 Sep audit found Saved living in localStorage as a copy of the whole
 * post — signed media URL included, which expires in an hour, so every saved
 * photograph was broken by the time anybody came back to it; and a post its
 * author had since deleted rendered forever from the copy, on the one device
 * it was saved on.
 *
 * A bookmark is a pointer. Four things follow, and each has a test:
 *
 *   1. A save on a REPOST row points at the ORIGINAL, because the original is
 *      what the card renders and what the citizen read.
 *   2. The Saved page re-reads every post through the feed's own gates —
 *      VISIBLE_ONLY, the audience gate, blocks, reachable author — in the
 *      order the citizen saved them. A pointer that no longer resolves is
 *      simply absent.
 *   3. The one-time sync of a device's old ids writes only what resolves.
 *   4. A like is news ONCE: a second transition to liked by the same person
 *      on the same post writes no second notification.
 */

const ME = 'me-0000';
const OTHER = 'other-0000';
const ORIGINAL = '11111111-1111-4111-8111-111111111111';
const SHARE = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';

function build(over: { bookmarks?: any[]; posts?: any[]; likeTold?: boolean } = {}) {
  const calls: Array<{ model: string; op: string; args: any }> = [];
  const rec = (model: string, op: string, ret: any) => async (args: any) => { calls.push({ model, op, args }); return typeof ret === 'function' ? ret(args) : ret; };
  const posts = over.posts ?? [];
  const prisma: any = {
    bookmark: {
      findMany: rec('bookmark', 'findMany', (a: any) => {
        const rows = over.bookmarks ?? [];
        // savedSetFor asks by postId in; the page asks by userId + keyset.
        if (a?.where?.postId?.in) return rows.filter((b) => a.where.postId.in.includes(b.postId));
        return rows;
      }),
      createMany: rec('bookmark', 'createMany', (a: any) => ({ count: a.data.length })),
      deleteMany: rec('bookmark', 'deleteMany', { count: 0 }),
    },
    post: {
      findFirst: rec('post', 'findFirst', (a: any) => posts.find((p) => p.id === a.where.id) ?? null),
      findUnique: rec('post', 'findUnique', (a: any) => posts.find((p) => p.id === a.where.id) ?? null),
      findMany: rec('post', 'findMany', (a: any) => posts.filter((p) => a.where.id.in.includes(p.id) && p.moderation === 'visible')),
    },
    like: {
      deleteMany: rec('like', 'deleteMany', { count: 0 }),
      createMany: rec('like', 'createMany', { count: 1 }),
      count: rec('like', 'count', 1),
    },
    notification: {
      findFirst: rec('notification', 'findFirst', over.likeTold ? { id: 'n1' } : null),
    },
    follow: { findMany: rec('follow', 'findMany', []) },
    connection: { findMany: rec('connection', 'findMany', []) },
    user: { findUnique: rec('user', 'findUnique', { name: 'Somen' }) },
  };
  const created: any[] = [];
  const notifications = { create: async (n: any) => { created.push(n); } } as any;
  const gateway = { likeChanged: () => undefined, postNew: () => undefined } as any;
  const storage = { signPostMedia: async () => new Map<string, string>() } as any;
  const connections = { visibleAudiences: async () => new Set(['public']) } as any;
  const blocking = { blockedWith: async () => new Set<string>() } as any;
  const svc = new SocialService(prisma, gateway, notifications, storage, connections, blocking, {} as never, undefined, undefined);
  // The fan-out reads the graph off the request path; a stub that returns
  // nothing is enough for a test about rows and notifications.
  (svc as any).broadcast = () => undefined;
  return { svc, calls, created };
}

const post = (id: string, extra: Partial<Record<string, unknown>> = {}) => ({
  id, authorId: OTHER, audience: 'public', moderation: 'visible', repostOfId: null,
  text: 't', feeling: null, lat: null, lng: null, createdAt: new Date('2026-09-04T00:00:00Z'),
  author: { id: OTHER, handle: 'o', name: 'O', profileImage: null }, media: [],
  _count: { likes: 0, comments: 0 }, likes: [], repostOf: null,
  ...extra,
});

describe('a saved post is a row', () => {
  it('a save on a repost row bookmarks the ORIGINAL', async () => {
    const orig = post(ORIGINAL);
    const share = post(SHARE, { repostOfId: ORIGINAL, repostOf: orig });
    const { svc, calls } = build({ posts: [orig, share] });
    const out = await svc.toggleBookmark(ME, SHARE);
    expect(out).toEqual({ postId: ORIGINAL, saved: true });
    const write = calls.find((c) => c.model === 'bookmark' && c.op === 'createMany');
    expect(write?.args.data).toEqual([{ userId: ME, postId: ORIGINAL }]);
    expect(write?.args.skipDuplicates).toBe(true);
  });

  it('the Saved page reads through the feed gates, in bookmark order, and drops what no longer resolves', async () => {
    const a = post(ORIGINAL);
    const removed = post(GONE, { moderation: 'removed' });
    const { svc, calls } = build({
      posts: [a, removed],
      bookmarks: [
        { id: 'b2', postId: GONE, createdAt: new Date('2026-09-04T02:00:00Z') },
        { id: 'b1', postId: ORIGINAL, createdAt: new Date('2026-09-04T01:00:00Z') },
      ],
    });
    const page = await svc.bookmarks(ME, { limit: 30 });
    expect(page.items.map((p: any) => p.id)).toEqual([ORIGINAL]);
    expect(page.items[0]).toMatchObject({ savedByMe: true });
    // THE ASSERTION THIS FILE EXISTS FOR: the read carries the moderation
    // filter, the audience gate and the reachable-author predicate — the same
    // three the feed carries, because it is the same rule.
    const read = calls.find((c) => c.model === 'post' && c.op === 'findMany');
    expect(read?.args.where).toMatchObject({ moderation: 'visible' });
    expect(read?.args.where.author).toBeDefined();
    expect(Array.isArray(read?.args.where.AND)).toBe(true);
    expect(read?.args.where.AND[0].OR).toEqual(expect.arrayContaining([{ audience: 'public' }, { authorId: ME }]));
    expect(read?.args.take).toBe(2);
  });

  it('the feed says which posts are saved, keyed by the post that renders', async () => {
    const orig = post(ORIGINAL);
    const share = post(SHARE, { repostOfId: ORIGINAL, repostOf: orig });
    const { svc } = build({
      posts: [orig, share],
      bookmarks: [{ id: 'b1', postId: ORIGINAL, createdAt: new Date() }],
    });
    const one = await svc.post(ME, SHARE);
    expect(one).toMatchObject({ id: ORIGINAL, key: SHARE, savedByMe: true });
  });

  it('the one-time sync writes only what the citizen can still see', async () => {
    const a = post(ORIGINAL);
    const removed = post(GONE, { moderation: 'removed' });
    const { svc, calls } = build({ posts: [a, removed] });
    const out = await svc.syncBookmarks(ME, [ORIGINAL, GONE, ORIGINAL]);
    expect(out).toEqual({ saved: 1 });
    const write = calls.find((c) => c.model === 'bookmark' && c.op === 'createMany');
    expect(write?.args.data).toEqual([{ userId: ME, postId: ORIGINAL }]);
  });
});

describe('a like is news once', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('writes the notification the first time', async () => {
    const { svc, created } = build({ posts: [post(ORIGINAL)], likeTold: false });
    await svc.toggleLike(ME, ORIGINAL);
    await flush(); await flush();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ userId: OTHER, actorId: ME, kind: 'like', entityId: ORIGINAL });
  });

  it('and not the second time the same person likes the same post', async () => {
    const { svc, created, calls } = build({ posts: [post(ORIGINAL)], likeTold: true });
    await svc.toggleLike(ME, ORIGINAL);
    await flush(); await flush();
    expect(created).toHaveLength(0);
    // The lookup is the indexed one — recipient, kind, entity — and names the actor.
    const look = calls.find((c) => c.model === 'notification');
    expect(look?.args.where).toMatchObject({ userId: OTHER, kind: 'like', entityId: ORIGINAL, actorId: ME });
  });
});
