/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { SocialService } from './social.service';

/**
 * ── A SHARE IS NOT A KEY TO THE ROOM ────────────────────────────────────────
 *
 * The 31 Aug audit's fourth critical. `repostWhere` checked the shared post
 * for moderation and for a block, and never for its AUDIENCE — while
 * `shapeFeedRow` renders the shared post's text, media and author.
 *
 * The repost row inherits the original's audience label when it is created, so
 * the gate saw the right WORD and matched it against the wrong PERSON: the
 * row's authorId is the sharer.
 *
 *     Alice writes a friends-only post.
 *     Bob, her friend, shares it.
 *     Carol is Bob's friend and a stranger to Alice.
 *     The row reads { audience: 'friends', authorId: Bob }.
 *     Bob is in Carol's circle. The row matches. Carol is served Alice's
 *     friends-only post, under Alice's name.
 *
 * Every share re-published a room to people its author never chose, and the
 * wider the sharer's circle the further it went. The permalink path was always
 * right — `post()` calls `assertCanView` on the ORIGINAL. It was the feed,
 * which is where a post actually reaches people, that asked the easier
 * question.
 *
 * ── WHY THIS FILE EXECUTES THE WHERE INSTEAD OF READING IT ──────────────────
 *
 * `an-audience-is-not-a-follow.spec.ts` captures the `where` object and asserts
 * on its shape, and says plainly that it does not run the query. That was the
 * honest limit for defect 1, where the defect was a NAME (`network` where
 * `circle` belonged) and visible in the object.
 *
 * It is the wrong instrument for this one. Here the object looked correct —
 * an audience gate was present, with all four branches — and matched the wrong
 * rows. A shape assertion cannot tell those apart, which is most of why this
 * survived the last audit.
 *
 * So this file interprets the where against real rows. The interpreter
 * understands a declared subset of Prisma's operators and THROWS on anything
 * else, including any key it has not been taught. That is the property that
 * makes it trustworthy rather than a second lie: it cannot quietly ignore a
 * clause it did not understand and report a pass. `the interpreter is not a
 * pushover` below asserts exactly that, because an evaluator nobody checked is
 * worth less than the regex it replaced.
 */

const CAROL = 'carol-0000';   // the viewer
const BOB = 'bob-1111';       // Carol's accepted connection — and family
const ALICE = 'alice-2222';   // a stranger to Carol
const BLOCKED = 'blok-3333';

/* ────────────────────────────────────────────────────────────────────────── */

type Row = {
  id: string;
  authorId: string;
  audience: string;
  moderation?: string;
  repostOfId?: string | null;
  repostOf?: Row | null;
  /* The feed asks about the AUTHOR now, not only about the post: a suspended
     account's posts stayed in everybody's feed because `suspendedAt` was read
     in four auth files and nowhere a citizen could reach (3 Sep). Absent here
     means an ordinary, reachable author, which is what every fixture below is
     unless it says otherwise. */
  author?: { deletedAt?: string | null; suspendedAt?: string | null };
};

/**
 * The subset of Prisma's `where` this file can execute:
 *
 *   · a scalar field compared to a string or null
 *   · { in: [...] }, { notIn: [...] }
 *   · OR: [...], AND: [...]
 *   · a to-one relation as { is: { … } }
 *
 * Anything else throws. The feed's where for `foryou` uses only these; a
 * future clause that needs more will fail loudly here rather than be skipped.
 */
function matches(where: any, row: Row): boolean {
  if (where === null || typeof where !== 'object') throw new Error(`not a where: ${String(where)}`);
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as any[]).every((c) => matches(c, row));
    if (key === 'OR') return (cond as any[]).some((c) => matches(c, row));
    if (key === 'repostOf') {
      const c = cond as any;
      if (!('is' in c) || Object.keys(c).length !== 1) throw new Error('only { is: … } is understood on a relation');
      return row.repostOf ? matches(c.is, row.repostOf) : false;
    }
    /* A to-one relation that is always present. Unlike `repostOf`, every post
       has an author, so an absent fixture means the defaults rather than "no
       match" — otherwise adding the clause would empty every feed in here. */
    if (key === 'author') {
      const c = cond as any;
      if (!('is' in c) || Object.keys(c).length !== 1) throw new Error('only { is: … } is understood on a relation');
      return matches(c.is, { deletedAt: null, suspendedAt: null, ...(row.author ?? {}) } as unknown as Row);
    }
    const value = key === 'moderation'
      ? (row.moderation ?? 'visible')
      : (row as any)[key] ?? null;
    if (cond === null || typeof cond === 'string') return value === cond;
    if (cond && typeof cond === 'object') {
      const ops = Object.keys(cond as object);
      const unknown = ops.filter((o) => o !== 'in' && o !== 'notIn');
      if (unknown.length) throw new Error(`operator not understood: ${key}.${unknown.join(',')}`);
      const c = cond as { in?: string[]; notIn?: string[] };
      if (c.notIn && c.notIn.includes(value)) return false;
      if (c.in && !c.in.includes(value)) return false;
      return true;
    }
    throw new Error(`condition not understood on ${key}`);
  });
}

/** Run `feed()` far enough to capture the where it hands Prisma. */
async function whereForCarol(blocked: string[] = []) {
  let captured: any = null;
  const prisma = {
    follow: { findMany: async () => [] },
    connection: {
      findMany: async () => [
        // Accepted, Social granted, and family — so Carol's circle AND her
        // family set both contain Bob and nobody else.
        { userOneId: CAROL, userTwoId: BOB, relationship: 'family', modulesJson: JSON.stringify(['social']) },
      ],
    },
    post: {
      findMany: async (args: any) => { captured = args.where; return []; },
      findUnique: async () => null,
    },
  } as any;
  const blocking = { blockedWith: async () => new Set(blocked) } as any;
  const storage = { signPostMedia: async () => new Map() } as any;
  const svc = new SocialService(prisma, {} as never, {} as never, storage, {} as never, blocking, {} as never);
  await svc.feed(CAROL, { limit: 20, filter: 'foryou' } as any);
  if (!captured) throw new Error('feed() did not query posts');
  return captured;
}

/** A post, and a share of it by Bob — the two rows every case here needs. */
const post = (id: string, authorId: string, audience: string, moderation = 'visible'): Row =>
  ({ id, authorId, audience, moderation, repostOfId: null, repostOf: null });
const sharedByBob = (original: Row): Row =>
  ({ id: `share-${original.id}`, authorId: BOB, audience: original.audience, moderation: 'visible', repostOfId: original.id, repostOf: original });

describe('a share is served on the ORIGINAL author’s terms', () => {
  it('does not hand a stranger’s friends-only post to the sharer’s friends', async () => {
    const where = await whereForCarol();
    // Alice is a stranger to Carol. Bob, who Carol IS connected to, shares it.
    expect(matches(where, sharedByBob(post('p1', ALICE, 'friends')))).toBe(false);
    // And the original itself was never reachable either, which is the point
    // the share was routing around.
    expect(matches(where, post('p1', ALICE, 'friends'))).toBe(false);
  });

  it('does not hand a stranger’s family post to the sharer’s family', async () => {
    // Bob is Carol's family, so the row's own `{ audience: 'family',
    // authorId: Bob }` matches. Alice is not.
    const where = await whereForCarol();
    expect(matches(where, sharedByBob(post('p2', ALICE, 'family')))).toBe(false);
  });

  it('still serves a share of a PUBLIC post to everybody', async () => {
    const where = await whereForCarol();
    expect(matches(where, sharedByBob(post('p3', ALICE, 'public')))).toBe(true);
  });

  it('still serves a share of a post the viewer is genuinely inside', async () => {
    const where = await whereForCarol();
    // Bob's own friends post, shared onward by Bob: Carol is in Bob's circle.
    expect(matches(where, sharedByBob(post('p4', BOB, 'friends')))).toBe(true);
    // And Carol's own post, whoever shared it.
    expect(matches(where, sharedByBob(post('p5', CAROL, 'friends')))).toBe(true);
  });

  it('leaves an ordinary post alone — a row that is not a share is unaffected', async () => {
    const where = await whereForCarol();
    expect(matches(where, post('p6', BOB, 'friends'))).toBe(true);
    expect(matches(where, post('p7', ALICE, 'public'))).toBe(true);
    expect(matches(where, post('p8', ALICE, 'friends'))).toBe(false);
    expect(matches(where, post('p9', ALICE, 'private'))).toBe(false);
    expect(matches(where, post('p10', CAROL, 'private'))).toBe(true);
  });

  it('keeps the two checks it already had — a removed original and a blocked author', async () => {
    const where = await whereForCarol([BLOCKED]);
    expect(matches(where, sharedByBob(post('p11', ALICE, 'public', 'removed')))).toBe(false);
    expect(matches(where, sharedByBob(post('p12', BLOCKED, 'public')))).toBe(false);
  });

  /**
   * AND THE ORIGINAL'S AUTHOR IS STILL HERE (launch gate, third reading,
   * 4 Sep). The feed's own rows carry `author: REACHABLE_USER`; the share
   * gate checked visibility, audience and blocks and not the author, so a
   * suspended account's post kept being served through anybody's share.
   */
  it('does not serve a share of a suspended or deleted author’s post', async () => {
    const where = await whereForCarol();
    const suspended = { ...post('p13', ALICE, 'public'), author: { suspendedAt: '2026-09-01T00:00:00Z' } };
    const deleted = { ...post('p14', ALICE, 'public'), author: { deletedAt: '2026-09-01T00:00:00Z' } };
    expect(matches(where, sharedByBob(suspended))).toBe(false);
    expect(matches(where, sharedByBob(deleted))).toBe(false);
    // The same original with its author still here is served.
    expect(matches(where, sharedByBob(post('p15', ALICE, 'public')))).toBe(true);
  });

  it('the permalink of a share asks the same question', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'social.service.ts'), 'utf8');
    const fn = src.slice(src.indexOf('async post(userId: string, postId: string)'));
    expect(fn).toMatch(/OR: \[\{ repostOfId: null \}, \{ repostOf: \{ is: \{ author: REACHABLE_USER \} \} \}\]/);
  });
});

describe('the interpreter is not a pushover', () => {
  /**
   * An evaluator nobody checked is worth less than the regex it replaced: if
   * it silently skipped the clause under test, every assertion above would
   * pass for the wrong reason.
   */
  it('throws on any operator it has not been taught', () => {
    const row = post('x', ALICE, 'public');
    expect(() => matches({ text: { contains: 'hi' } }, row)).toThrow(/not understood/);
    expect(() => matches({ media: { some: { kind: 'image' } } }, row)).toThrow(/not understood/);
    expect(() => matches({ repostOf: { every: {} } }, row)).toThrow(/only \{ is/);
  });

  it('actually distinguishes the rows it is asked about', async () => {
    const where = await whereForCarol();
    const rows = [
      post('a', ALICE, 'public'),
      post('b', ALICE, 'friends'),
      sharedByBob(post('c', ALICE, 'friends')),
      sharedByBob(post('d', ALICE, 'public')),
    ];
    // Not "everything passes" and not "nothing passes" — both of which is how
    // a broken interpreter reads.
    expect(rows.map((r) => matches(where, r))).toEqual([true, false, false, true]);
  });

  it('reads the where the service actually built, not one this file wrote', async () => {
    const where = await whereForCarol();
    // If feed() stopped constraining the shared post at all, the clause this
    // file exists to execute would not be there to execute.
    expect(JSON.stringify(where)).toContain('repostOf');
  });
});
