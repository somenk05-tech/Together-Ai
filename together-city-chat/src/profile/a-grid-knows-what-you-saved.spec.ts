/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProfileService } from './profile.service';

/**
 * ── A GRID KNOWS WHAT YOU SAVED (launch gate, third reading, 4 Sep) ─────────
 *
 * Saved posts became rows on the account on 4 Sep, and the feed sends
 * `savedByMe` on every card. The two profile grids — your own posts and
 * somebody else's — render the same PostCard and sent no such flag, so the
 * card said "Save" over a post already saved, and tapping it unsaved the
 * post while the label stayed "Save". Both reads now carry the flag, from
 * the same table, swallowed the same way the feed swallows it.
 */
const row = (id: string) => ({
  id, text: 't', feeling: null, createdAt: new Date('2026-09-04T00:00:00Z'), lat: null, lng: null,
  media: [], _count: { likes: 0, comments: 0 }, author: { id: 'me', handle: 'me', name: 'Me', profileImage: null }, likes: [],
});

function build(saved: string[], withTable = true) {
  const prisma: any = {
    post: { findMany: async () => [row('p1'), row('p2'), row('p3')] },
    user: { findUnique: async () => ({ id: 'them', deletedAt: null, suspendedAt: null }) },
    ...(withTable ? { bookmark: { findMany: async ({ where }: any) => saved.filter((id) => where.postId.in.includes(id)).map((postId) => ({ postId })) } } : {}),
  };
  const storage = { signPostMedia: async () => new Map() };
  const svc = new ProfileService(prisma, {} as never, { visibleAudiences: async () => ['public'] } as never, { isBlocked: async () => false } as never, {} as never, storage as never);
  return svc;
}

describe('a grid knows what you saved', () => {
  it('your own posts carry savedByMe from the bookmark table', async () => {
    const { items } = await build(['p2']).myPosts('me');
    expect(items.map((i) => [i.id, i.savedByMe])).toEqual([['p1', false], ['p2', true], ['p3', false]]);
  });

  it('somebody else’s posts carry it for the VIEWER', async () => {
    const { items } = await build(['p3']).publicPosts('me', 'them');
    expect(items.map((i) => i.savedByMe)).toEqual([false, false, true]);
  });

  it('a missing delegate is false everywhere, not a 500', async () => {
    const { items } = await build(['p1'], false).myPosts('me');
    expect(items.every((i) => i.savedByMe === false)).toBe(true);
  });
});
