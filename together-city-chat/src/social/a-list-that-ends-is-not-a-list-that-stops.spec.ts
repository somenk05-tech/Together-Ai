/* eslint-disable @typescript-eslint/no-explicit-any */
import { SocialService } from './social.service';

/**
 * ── A LIST THAT ENDS IS NOT A LIST THAT STOPS ───────────────────────────────
 *
 * `shared/paging.ts` opens by saying exactly what its caps are and are not:
 * "A ceiling is not the same as pagination, and this is deliberately the
 * cheaper of the two… Real cursor pagination — which these endpoints should
 * eventually have, the way /social/feed already does — is follow-up work."
 *
 * This is that follow-up work for the three lists in Social Life, and the
 * distinction that file drew is the thing being tested. A CAP stops the query
 * from growing forever and leaves the citizen at a cliff: the 501st comment on
 * a post existed, was counted by `_count.comments` on the card, and could be
 * reached by nobody — not its author, not the post's owner, not a moderator.
 * A CURSOR ends a page without ending the list.
 *
 * Followers is the awkward one and gets the most tests, because it is a union
 * of two sets that are bounded differently — connections by human reality,
 * followers by nothing — and the join is where a paginated union usually
 * starts showing people twice or losing them entirely.
 */

const ME = 'me-0000';
const person = (i: number) => ({ id: `u${i}`, handle: `h${i}`, name: `N${i}`, profileImage: null });

/** A prisma stub over fixed rows that honours take / cursor / skip. */
function db(over: { comments?: number; followers?: number; conns?: string[]; follows?: string[] } = {}) {
  const comments = Array.from({ length: over.comments ?? 0 }, (_, i) => ({
    id: `c${i}`, postId: 'p1', text: `t${i}`, createdAt: new Date(1000 + i), author: person(i),
  }));
  const follows = Array.from({ length: over.followers ?? 0 }, (_, i) => ({
    id: `f${i}`, followerId: `u${i}`, followeeId: ME, createdAt: new Date(1000 + i), follower: person(i),
  }));
  const conns = (over.conns ?? []).map((id) => ({ userOneId: ME, userTwoId: id, relationship: null }));

  const page = <T extends { id: string }>(rows: T[], args: any): T[] => {
    let out = rows;
    if (args?.where?.followerId?.notIn) {
      out = out.filter((r) => !args.where.followerId.notIn.includes((r as any).followerId));
    }
    if (args?.where?.followerId?.in) {
      out = out.filter((r) => args.where.followerId.in.includes((r as any).followerId));
    }
    if (args?.orderBy?.[0]?.createdAt === 'desc') out = [...out].reverse();
    if (args?.cursor?.id) {
      const at = out.findIndex((r) => r.id === args.cursor.id);
      out = at < 0 ? out : out.slice(at + (args.skip ?? 0));
    }
    return typeof args?.take === 'number' ? out.slice(0, args.take) : out;
  };

  return {
    post: { findUnique: async () => ({ id: 'p1', authorId: ME, audience: 'public' }) },
    comment: {
      findMany: async (a: any) => page(comments, a),
      findUnique: async (a: any) => comments.find((c) => c.id === a.where.id) ?? null,
    },
    follow: {
      /* Dispatched on the WHERE, because three different reads land here and
         they mean opposite things: inbound (who follows me), outbound (who I
         follow), and the bounded follow-back probe over one page. */
      findMany: async (a: any) => {
        const w = a?.where ?? {};
        if (w.followerId === ME) {
          const ids: string[] = w.followeeId?.in
            ? (over.follows ?? []).filter((id) => w.followeeId.in.includes(id))
            : (over.follows ?? []);
          return ids.map((id) => ({ followeeId: id }));
        }
        if (w.followeeId === ME && w.followerId?.in) {
          return (over.follows ?? [])
            .filter((id) => w.followerId.in.includes(id))
            .map((id) => ({ followerId: id }));
        }
        return page(follows, a);
      },
      findUnique: async (a: any) => follows.find((f) => f.id === a.where.id) ?? null,
    },
    connection: { findMany: async () => conns },
    user: {
      findMany: async (a: any) => (a.where.id.in as string[]).map((id) => person(Number(id.slice(1)))),
    },
  } as any;
}

function svc(prisma: any) {
  const blocking = { blockedWith: async () => new Set<string>() } as any;
  const connections = { visibleAudiences: async () => ['public'] } as any;
  return new SocialService(prisma, {} as never, {} as never, {} as never, connections, blocking, {} as never);
}

describe('a comment thread can be read past its five hundredth comment', () => {
  it('returns a page and a cursor rather than everything', async () => {
    const s = svc(db({ comments: 25 }));
    const first: any = await s.comments(ME, 'p1', { limit: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).toBe('c9');
  });

  it('walks the whole thread without repeating or losing one', async () => {
    // THE ASSERTION THAT MATTERS. A cursor that is off by one either shows a
    // comment twice or skips it, and both look fine on a single page.
    const s = svc(db({ comments: 25 }));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const pg: any = await s.comments(ME, 'p1', { limit: 10, cursor });
      seen.push(...pg.items.map((c: any) => c.id));
      if (!pg.nextCursor) break;
      cursor = pg.nextCursor;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe('c0');
    expect(seen[24]).toBe('c24');
  });

  it('says there is no next page when the thread ends exactly on a boundary', async () => {
    // The off-by-one that a `take: limit` (rather than `limit + 1`) hides: a
    // full last page looks identical to a page with more behind it.
    const s = svc(db({ comments: 10 }));
    const pg: any = await s.comments(ME, 'p1', { limit: 10 });
    expect(pg.items).toHaveLength(10);
    expect(pg.nextCursor).toBeNull();
  });

  it('starts at the beginning, because a thread is read as a conversation', async () => {
    const s = svc(db({ comments: 5 }));
    const pg: any = await s.comments(ME, 'p1', { limit: 5 });
    expect(pg.items.map((c: any) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
  });

  it('ignores a cursor whose comment was deleted between pages', async () => {
    const s = svc(db({ comments: 5 }));
    const pg: any = await s.comments(ME, 'p1', { limit: 5, cursor: 'deleted-one' });
    expect(pg.items).toHaveLength(5);
  });
});

describe('the followers list pages without showing anyone twice', () => {
  it('puts the connections on the first page and never on a later one', async () => {
    // Connections are mutual and consented to, so they are bounded by human
    // reality; followers are bounded by nothing. That is why one half is read
    // whole and the other is paged.
    const s = svc(db({ followers: 20, conns: ['u3', 'u4'] }));
    const first: any = await s.followers(ME, { limit: 5 });
    const ids = first.items.map((p: any) => p.id);
    expect(ids).toContain('u3');
    expect(ids).toContain('u4');

    const second: any = await s.followers(ME, { limit: 5, cursor: first.nextCursor });
    expect(second.items.map((p: any) => p.id)).not.toContain('u3');
    expect(second.items.map((p: any) => p.id)).not.toContain('u4');
  });

  it('walks every follower exactly once', async () => {
    const s = svc(db({ followers: 12, conns: ['u3'] }));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const pg: any = await s.followers(ME, { limit: 5, cursor });
      seen.push(...pg.items.map((p: any) => p.id));
      if (!pg.nextCursor) break;
      cursor = pg.nextCursor;
    }
    // Twelve followers, one of whom is also a connection — so twelve people,
    // each once. A union that double-counts shows thirteen.
    expect(new Set(seen).size).toBe(12);
    expect(seen.length).toBe(12);
  });

  it('never asks Postgres for an unbounded follower page', async () => {
    const calls: any[] = [];
    const prisma = db({ followers: 5 });
    const inner = prisma.follow.findMany;
    prisma.follow.findMany = async (a: any) => { calls.push(a); return inner(a); };
    await svc(prisma).followers(ME, { limit: 5 });
    for (const c of calls) expect(typeof c.take).toBe('number');
  });
});

describe('the following list pages over ids, not over profiles', () => {
  it('fetches only the page it is about to show', async () => {
    const asked: string[][] = [];
    const prisma = db({ follows: Array.from({ length: 20 }, (_, i) => `u${i}`) });
    prisma.user.findMany = async (a: any) => { asked.push(a.where.id.in); return (a.where.id.in as string[]).map((id) => person(Number(id.slice(1)))); };
    const pg: any = await svc(prisma).following(ME, { limit: 5 });
    expect(pg.items).toHaveLength(5);
    // The whole point: twenty in the network, five profiles read.
    expect(asked[0]).toHaveLength(5);
  });

  it('walks the whole network exactly once', async () => {
    const s = svc(db({ follows: Array.from({ length: 13 }, (_, i) => `u${i}`) }));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const pg: any = await s.following(ME, { limit: 5, cursor });
      seen.push(...pg.items.map((p: any) => p.id));
      if (!pg.nextCursor) break;
      cursor = pg.nextCursor;
    }
    expect(new Set(seen).size).toBe(13);
  });

  it('survives the cursor person being unfollowed between pages', async () => {
    /* WHY THE CURSOR IS A VALUE AND NOT A POSITION. An offset cursor ("after
       the fifth") silently skips a row when the list shrinks underneath it.
       `id > cursor` cannot: the answer to "what comes after u4" is the same
       whether or not u4 is still there. */
    const s = svc(db({ follows: ['u0', 'u1', 'u2', 'u5', 'u6'] }));
    const pg: any = await s.following(ME, { limit: 5, cursor: 'u4' });
    expect(pg.items.map((p: any) => p.id)).toEqual(['u5', 'u6']);
  });
});
