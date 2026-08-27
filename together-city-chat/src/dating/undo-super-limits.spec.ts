import { DatingService } from './dating.service';
import { DAILY_LIKES, DAILY_SUPER_LIKES } from './limits';

/**
 * M2 — a like you cannot spend twice, a super-like worth receiving, and a way
 * back from a pass.
 *
 * The figures are NOT asserted here. limits.ts owns them and they are the
 * owner's to change; this pins the behaviour they express — that a limit
 * exists, that it counts from the citizen's own midnight, that a super-like is
 * scarce and visible, and that undo hands back the pass it can prove was last.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = {
  id: string; userOneId: string; userTwoId: string; kind: string; status: string;
  likedByOne: boolean; likedByTwo: boolean; passedByOne: boolean; passedByTwo: boolean;
  likedAtOne: Date | null; likedAtTwo: Date | null;
  passedAtOne: Date | null; passedAtTwo: Date | null;
  superByOne: boolean; superByTwo: boolean; conversationId: string | null;
};

const blank = (over: Partial<Row> & { id: string; userOneId: string; userTwoId: string }): Row => ({
  kind: 'romantic', status: 'pending',
  likedByOne: false, likedByTwo: false, passedByOne: false, passedByTwo: false,
  likedAtOne: null, likedAtTwo: null, passedAtOne: null, passedAtTwo: null,
  superByOne: false, superByTwo: false, conversationId: null, ...over,
});

/** Enough of a Prisma table to answer the queries this feature actually makes. */
function table(rows: Row[]) {
  const matches = (r: Row, w: any): boolean => {
    if (!w) return true;
    if (w.OR) return w.OR.some((c: any) => matches(r, c));
    return Object.entries(w).every(([k, v]: [string, any]) => {
      const cell = (r as any)[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('not' in v) return v.not === null ? cell !== null : cell !== v.not;
        if ('gte' in v) return cell != null && cell.getTime() >= v.gte.getTime();
      }
      return cell === v;
    });
  };
  const sorted = (list: Row[], orderBy: any) => {
    if (!orderBy) return list;
    const [field, dir] = Object.entries(orderBy)[0] as [string, string];
    return [...list].sort((a, b) => {
      const av = (a as any)[field]?.getTime?.() ?? 0;
      const bv = (b as any)[field]?.getTime?.() ?? 0;
      return dir === 'desc' ? bv - av : av - bv;
    });
  };
  return {
    rows,
    findMany: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)),
    findFirst: async ({ where, orderBy }: any = {}) => sorted(rows.filter((r) => matches(r, where)), orderBy)[0] ?? null,
    update: async ({ where, data }: any) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
    upsert: async ({ where, create }: any) => {
      const { userOneId, userTwoId, kind } = where.userOneId_userTwoId_kind;
      let r = rows.find((x) => x.userOneId === userOneId && x.userTwoId === userTwoId && x.kind === kind);
      if (!r) { r = blank({ id: `m${rows.length + 1}`, ...create }); rows.push(r); }
      return r;
    },
  };
}

function build(rows: Row[] = []) {
  const t = table(rows);
  const s: any = Object.create(DatingService.prototype);
  // The write routes now refuse a target who is not a visible, approved
  // profile outside the caller's connections (assertWritable, 26 Aug). Every
  // target here is a stranger who is; the score cache write is best-effort.
  s.prisma = {
    datingMatch: t,
    datingProfile: { findUnique: async () => ({ visible: true, moderation: 'approved', birthDate: new Date('1995-01-01T00:00:00Z'), interests: '', extras: null }) },
    connection: { findMany: async () => [] },
    // AND THE TARGET MUST STILL BE HERE (27 Aug). `undoLastPass` restores a
    // match to `matched` when they had liked you, which is wrong if they have
    // since deleted their account — one button put a departed citizen back in
    // the chats tab and re-opened the message gate. Every target in this file
    // is somebody who is still here; the case where they are not has its own
    // assertion at the end.
    user: { findUnique: async () => ({ deletedAt: null }) },
  };
  s.blocking = { blockedWith: async () => [] };
  s.cacheScore = async () => undefined;
  s.analytics = { track: () => undefined };
  s.redis = { up: false };
  s.jobs = { add: async () => false };
  s.clock = {
    timezoneFor: async () => 'Asia/Kolkata',
    startOfDayIn: () => new Date('2026-08-01T00:00:00Z'),
    todayIn: () => '2026-08-01',
  };
  s.notifications = { create: async () => ({}) };
  return { s, t };
}

/** 'me' sorts before 'zz' and after 'aa', so both sides of the pair are testable. */
const ME = 'me';

describe('the daily limit', () => {
  it('refuses the like that would go over, and says when it comes back', async () => {
    const rows = Array.from({ length: DAILY_LIKES }, (_, i) =>
      blank({ id: `x${i}`, userOneId: ME, userTwoId: `zz${i}`, likedByOne: true, likedAtOne: new Date('2026-08-01T09:00:00Z') }));
    const { s } = build(rows);
    await expect(s.like(ME, 'zznew', 'romantic')).rejects.toThrow(/daily limit/i);
    await expect(s.like(ME, 'zznew', 'romantic')).rejects.toThrow(/midnight/i);
  });

  it('counts only today — yesterday does not follow you into the morning', async () => {
    const rows = Array.from({ length: DAILY_LIKES }, (_, i) =>
      blank({ id: `x${i}`, userOneId: ME, userTwoId: `zz${i}`, likedByOne: true, likedAtOne: new Date('2026-07-31T09:00:00Z') }));
    const { s } = build(rows);
    await expect(s.like(ME, 'zznew', 'romantic')).resolves.toMatchObject({ matched: false });
  });

  it('re-liking somebody you already liked does not cost a second one', async () => {
    const rows = Array.from({ length: DAILY_LIKES }, (_, i) =>
      blank({ id: `x${i}`, userOneId: ME, userTwoId: `zz${i}`, likedByOne: true, likedAtOne: new Date('2026-08-01T09:00:00Z') }));
    const { s } = build(rows);
    // At the cap, and this is a card they already liked. A limit that punishes
    // a double-tap is a limit that reads as a bug.
    await expect(s.like(ME, 'zz0', 'romantic')).resolves.toBeTruthy();
  });

  it('reports what is left, from the citizen s own midnight', async () => {
    const { s } = build([
      blank({ id: 'a', userOneId: ME, userTwoId: 'zz1', likedByOne: true, likedAtOne: new Date('2026-08-01T09:00:00Z') }),
      blank({ id: 'b', userOneId: 'aa', userTwoId: ME, likedByTwo: true, likedAtTwo: new Date('2026-08-01T10:00:00Z'), superByTwo: true }),
    ]);
    const left = await s.likeAllowance(ME);
    expect(left.likesUsed).toBe(2);           // both sides of the pair row count
    expect(left.likesLeft).toBe(DAILY_LIKES - 2);
    expect(left.supersUsed).toBe(1);
    expect(left.resetsAtLocal).toContain('Asia/Kolkata');
  });
});

describe('the super-like', () => {
  it('is scarce, and running out does not stop ordinary likes', async () => {
    const used = Array.from({ length: DAILY_SUPER_LIKES }, (_, i) =>
      blank({ id: `s${i}`, userOneId: ME, userTwoId: `zz${i}`, likedByOne: true, likedAtOne: new Date('2026-08-01T09:00:00Z'), superByOne: true }));
    const { s } = build(used);
    await expect(s.like(ME, 'zznew', 'romantic', { superLike: true })).rejects.toThrow(/super-like/i);
    await expect(s.like(ME, 'zznew', 'romantic')).resolves.toMatchObject({ matched: false });
  });

  it('tells the person receiving it — scarcity nobody can see is just a counter', async () => {
    const { s } = build();
    const sent: any[] = [];
    s.notifications = { create: async (n: any) => { sent.push(n); return {}; } };
    await s.like(ME, 'zz1', 'romantic', { superLike: true });
    expect(sent[0].title).toContain('super-liked');
    expect(sent[0].body).toContain('one of these a day');
  });

  it('marks the row, so the receiving end can sort and label it', async () => {
    const { s, t } = build();
    await s.like(ME, 'zz1', 'romantic', { superLike: true });
    expect(t.rows[0].superByOne).toBe(true);
    expect(t.rows[0].likedByOne).toBe(true);
  });
});

describe('undo the last pass', () => {
  it('records when a pass happened, and hands back the most recent one', async () => {
    const { s, t } = build();
    await s.pass(ME, 'zz1', 'romantic');
    expect(t.rows[0].passedAtOne).toBeInstanceOf(Date);
    const out = await s.undoLastPass(ME, 'romantic');
    expect(out.undone).toBe(true);
    expect(out.targetUserId).toBe('zz1');
    expect(t.rows[0].passedByOne).toBe(false);
    expect(t.rows[0].passedAtOne).toBeNull();
  });

  it('THE CROSS-SIDE CASE: the newest pass wins even when it is on the other side of the pair', async () => {
    // The bug a single findMany would have shipped: ordering by
    // [{passedAtOne:'desc'},{passedAtTwo:'desc'}] sorts by passedAtOne FIRST,
    // so this citizen — userOne on the OLD row and userTwo on the NEW one —
    // gets handed back the wrong person.
    const { s } = build([
      blank({ id: 'old', userOneId: ME, userTwoId: 'zz9', passedByOne: true, passedAtOne: new Date('2026-08-01T08:00:00Z') }),
      blank({ id: 'new', userOneId: 'aa', userTwoId: ME, passedByTwo: true, passedAtTwo: new Date('2026-08-01T11:00:00Z') }),
    ]);
    const out = await s.undoLastPass(ME, 'romantic');
    expect(out.undone).toBe(true);
    expect(out.targetUserId).toBe('aa');
  });

  it('never resurrects an unmatch — that decision had somebody else in it', async () => {
    // unmatch() sets BOTH passed flags and no timestamp. The absence of a time
    // is what tells the two apart.
    const { s } = build([
      blank({ id: 'u', userOneId: ME, userTwoId: 'zz1', passedByOne: true, passedByTwo: true, status: 'passed' }),
    ]);
    const out = await s.undoLastPass(ME, 'romantic');
    expect(out.undone).toBe(false);
  });

  it('leaves a pass from before we recorded times alone', async () => {
    const { s } = build([
      blank({ id: 'legacy', userOneId: ME, userTwoId: 'zz1', passedByOne: true, status: 'passed' }),
    ]);
    expect((await s.undoLastPass(ME, 'romantic')).undone).toBe(false);
  });

  it('gives back their like too — undo restores matched, not blanket pending', async () => {
    const { s, t } = build([
      blank({ id: 'm', userOneId: ME, userTwoId: 'zz1', likedByOne: true, likedByTwo: true,
              passedByOne: true, passedAtOne: new Date('2026-08-01T08:00:00Z'), status: 'passed' }),
    ]);
    const out = await s.undoLastPass(ME, 'romantic');
    expect(out.theyLiked).toBe(true);
    expect(t.rows[0].status).toBe('matched');
  });

  it('says so plainly when there is nothing to undo', async () => {
    const { s } = build();
    const out = await s.undoLastPass(ME, 'romantic');
    expect(out.undone).toBe(false);
    expect(out.reason).toMatch(/no pass to undo/i);
  });

  it('a like after a pass clears the pass — you cannot be both', async () => {
    const { s, t } = build();
    await s.pass(ME, 'zz1', 'romantic');
    await s.like(ME, 'zz1', 'romantic');
    expect(t.rows[0].passedByOne).toBe(false);
    expect(t.rows[0].passedAtOne).toBeNull();
    expect(t.rows[0].likedByOne).toBe(true);
  });
  it('refuses when they have since deleted their account', async () => {
    // The write this undo performs sets `status` back to `matched` when they
    // had liked you. Doing that to somebody who has left re-created a live
    // match with a departed citizen — which then put them back in the chats
    // tab and re-opened the message gate. The refusal is a reason, not an
    // error: there is nothing wrong with the request, there is just nobody
    // to undo it towards.
    const { s, t } = build([
      blank({
        id: 'gone', userOneId: ME, userTwoId: 'zz1',
        passedByOne: true, passedAtOne: new Date('2026-08-01T09:00:00Z'),
        likedByTwo: true, likedAtTwo: new Date('2026-08-01T08:00:00Z'),
      }),
    ]);
    s.prisma.user = { findUnique: async () => ({ deletedAt: new Date('2026-08-02T00:00:00Z') }) };
    const out = await s.undoLastPass(ME, 'romantic');
    expect(out.undone).toBe(false);
    expect(out.reason).toMatch(/no longer on Together City/);
    // And the row is untouched — a refused undo must not half-apply.
    expect(t.rows[0].passedByOne).toBe(true);
    expect(t.rows[0].status).toBe('pending');
  });
});
