/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SocialService } from './social.service';

/**
 * ── THE NEWEST POST IS THE FIRST POST ───────────────────────────────────────
 *
 * Owner, 8 Sep, looking at his own profile grid: six tiles from 25 July at the
 * top of fifty-five posts.
 *
 * The grid reads `sortIndex asc NULLS LAST, createdAt desc`. Press Rearrange
 * once and the posts you can see get 0,1,2…; everything you post afterwards
 * has no index at all, and NULLS LAST puts it under the whole arrangement. So
 * the wall froze on the day it was arranged and every new post went to the
 * bottom of it — while the comment above the query claimed the opposite.
 *
 * NULLS FIRST IS NOT THE FIX, and that is the interesting half. Rearrange
 * saves the order of the posts LOADED so far — eighteen of fifty-five — so the
 * thirty-seven the author has never scrolled to also carry a null, and
 * flipping the sort would hoist those old photographs over the arrangement.
 * The new post takes the top slot explicitly instead: one below the author's
 * smallest index, written when the post is written.
 */

const ME = 'me-0000';

function rig(minSortIndex: number | null) {
  const created: any[] = [];
  const prisma = {
    post: {
      aggregate: jest.fn(async () => ({ _min: { sortIndex: minSortIndex } })),
      create: async (a: any) => { created.push(a); return { ...a.data, id: 'p-new', media: [], author: { id: ME } }; },
    },
  } as any;
  const gateway = { postNew: jest.fn() } as any;
  const notifications = { create: jest.fn(async () => undefined) } as any;
  const svc = new SocialService(
    prisma, gateway, notifications, {} as never, {} as never, {} as never, {} as never,
  );
  // Neither the media guard nor the signer is the subject here; nothing in
  // these posts carries a photograph.
  (svc as any).broadcast = () => undefined;
  (svc as any).signMediaOf = async () => new Map();
  (svc as any).shapePost = (p: any) => p;
  return { svc, prisma, created };
}

describe('a new post lands above the author’s arrangement', () => {
  it('takes one below the smallest index the author has', async () => {
    const { svc, created } = rig(0);
    await svc.createPost(ME, { text: 'the newest thing' } as any);
    expect(created[0].data.sortIndex).toBe(-1);
  });

  it('keeps going down, so two new posts read newest-first between them', async () => {
    // The second post is written when the smallest is already -1.
    const { svc, created } = rig(-1);
    await svc.createPost(ME, { text: 'newer still' } as any);
    expect(created[0].data.sortIndex).toBe(-2);
  });

  it('writes no index at all for an author who has never arranged anything', async () => {
    /* All-null falls through to `createdAt desc`, which is already
       newest-first. Numbering here would be a private arrangement the author
       never asked for — and the first one they DO make would have to fight it. */
    const { svc, created } = rig(null);
    await svc.createPost(ME, { text: 'first ever' } as any);
    expect(created[0].data.sortIndex).toBeNull();
  });

  it('asks only about that author’s arranged posts', async () => {
    const { svc, prisma } = rig(3);
    await svc.createPost(ME, { text: 'x' } as any);
    expect(prisma.post.aggregate).toHaveBeenCalledWith({
      where: { authorId: ME, sortIndex: { not: null } },
      _min: { sortIndex: true },
    });
  });
});

describe('the grid still reads the arrangement the author saved', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('orders by sortIndex, nulls last, then newest — on both grids', () => {
    /* NULLS LAST is load-bearing now rather than incidental: it is what keeps
       the posts an author never scrolled to from jumping the arrangement. */
    // Comments stripped first: the rationale above the query says the words
    // too, and a guard that counts its own explanation counts wrong.
    const svc = read('profile/profile.service.ts').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const matches = svc.match(/nulls: 'last'/g) ?? [];
    expect(matches.length).toBe(2);   // their own grid, and a visitor's view of it
    expect(svc).toMatch(/createdAt: 'desc'/);
  });

  it('repairs the posts already written, and moves nothing else', () => {
    const sql = read('../prisma/migrations/20260908T000000_the_newest_post_is_the_first_post/migration.sql');
    // Only un-arranged posts NEWER than the arrangement are lifted.
    expect(sql).toMatch(/p\."createdAt" > a\.arranged_through/);
    expect(sql).toMatch(/p\."sortIndex" IS NULL/);
    // Reposts are not on the grid; every read filters them out.
    expect(sql).toMatch(/p\."repostOfId" IS NULL/);
    // Newest first among them: oldest takes top_index - 1.
    expect(sql).toMatch(/ORDER BY p\."createdAt" ASC/);
  });
});
