import { DatingService } from './dating.service';

/**
 * ── THE SECOND AUDIT'S LESSON, MADE INTO TESTS ─────────────────────────────
 *
 * Every blocker in the second dating audit had a GREEN test beside it, because
 * the tests read source as text and asserted a line was written. This file
 * does the opposite: it constructs the service with a fake Prisma and CALLS the
 * methods, so it fails when the BEHAVIOUR breaks — which is the only kind of
 * failure that would have caught these.
 *
 * Covered here: blocker 01 (unmatch → like must not resurrect the match) and
 * blocker 05 (reveal must keep the conversation a dating conversation, so image
 * screening stays on). Blocker 03 lives in conversations, 06 in notifications,
 * 04 is a pure filter — each tested next to the code it fixes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = {
  id: string; userOneId: string; userTwoId: string; kind: string; status: string;
  likedByOne: boolean; likedByTwo: boolean; passedByOne: boolean; passedByTwo: boolean;
  likedAtOne: Date | null; likedAtTwo: Date | null; passedAtOne: Date | null; passedAtTwo: Date | null;
  superByOne: boolean; superByTwo: boolean; revealByOne: boolean; revealByTwo: boolean;
  conversationId: string | null; updatedAt: Date;
};
const row = (o: Partial<Row> & { id: string; userOneId: string; userTwoId: string }): Row => ({
  kind: 'romantic', status: 'pending', likedByOne: false, likedByTwo: false,
  passedByOne: false, passedByTwo: false, likedAtOne: null, likedAtTwo: null,
  passedAtOne: null, passedAtTwo: null, superByOne: false, superByTwo: false,
  revealByOne: false, revealByTwo: false, conversationId: 'c1', updatedAt: new Date('2026-08-01T00:00:00Z'), ...o,
});

function table(rows: Row[]) {
  const match = (r: Row, w: any): boolean => {
    if (!w) return true;
    if (w.OR) return w.OR.some((c: any) => match(r, c));
    return Object.entries(w).every(([k, v]) => {
      const cell = (r as any)[k];
      if (v && typeof v === 'object' && !(v instanceof Date) && 'not' in (v as any)) return cell !== (v as any).not;
      return cell === v;
    });
  };
  return {
    rows,
    findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)),
    findFirst: async ({ where }: any = {}) => rows.find((r) => match(r, where)) ?? null,
    update: async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id)!; Object.assign(r, data); return r; },
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => match(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    upsert: async ({ where, create }: any) => {
      const { userOneId, userTwoId, kind } = where.userOneId_userTwoId_kind;
      let r = rows.find((x) => x.userOneId === userOneId && x.userTwoId === userTwoId && x.kind === kind);
      if (!r) { r = row({ id: `m${rows.length + 1}`, ...create }); rows.push(r); }
      return r;
    },
  };
}

function build(rows: Row[]) {
  const t = table(rows);
  const setAnon: Array<number | null> = [];
  const s: any = Object.create(DatingService.prototype);
  s.prisma = {
    datingMatch: t,
    datingProfile: { findUnique: async () => ({ visible: true, moderation: 'approved', user: { deletedAt: null, suspendedAt: null }, birthDate: new Date('1995-01-01T00:00:00Z'), interests: '', extras: null }) },
    connection: { findMany: async () => [] },
    user: { findUnique: async () => ({ deletedAt: null }) },
  };
  s.blocking = { blockedWith: async () => [] };
  s.cacheScore = async () => undefined;
  s.analytics = { track: () => undefined };
  s.redis = { up: false };
  s.jobs = { add: async () => false, handle: () => undefined, schedule: async () => false };
  s.clock = { timezoneFor: async () => 'Asia/Kolkata', startOfDayIn: () => new Date('2026-08-01T00:00:00Z'), todayIn: () => '2026-08-01' };
  s.notifications = { create: async () => ({}) };
  s.conversations = {
    archiveForAll: async () => undefined,
    setAnonymousTrust: async (_id: string, v: number | null) => { setAnon.push(v); },
  };
  return { s, t, setAnon };
}

describe('unmatching cannot be undone by the other person (blocker 01)', () => {
  it('a single like after an unmatch does not flip the row back to matched', async () => {
    // A and B matched (both liked). A unmatches. Then B taps like once.
    const { s, t } = build([row({
      id: 'm', userOneId: 'A', userTwoId: 'B', status: 'matched',
      likedByOne: true, likedByTwo: true,
      likedAtOne: new Date('2026-08-01T09:00:00Z'), likedAtTwo: new Date('2026-08-01T09:00:00Z'),
    })]);
    await s.unmatch('A', 'B', 'romantic');
    // The unmatch must clear the likes, or the next like short-circuits.
    expect(t.rows[0].likedByOne).toBe(false);
    expect(t.rows[0].likedByTwo).toBe(false);
    expect(t.rows[0].status).toBe('passed');

    await s.like('B', 'A', 'romantic');   // B is userTwo
    // One tap must NOT produce a match — A has not chosen again.
    expect(t.rows[0].status).not.toBe('matched');
    expect(t.rows[0].likedByOne).toBe(false);   // A still has not re-liked
  });

  it('a genuine mutual re-like still works — both choosing again is a match', async () => {
    const { s, t } = build([row({
      id: 'm', userOneId: 'A', userTwoId: 'B', status: 'matched',
      likedByOne: true, likedByTwo: true,
    })]);
    await s.unmatch('A', 'B', 'romantic');
    await s.like('A', 'B', 'romantic');
    await s.like('B', 'A', 'romantic');
    expect(t.rows[0].status).toBe('matched');   // both re-liked → allowed
  });
});

describe('reveal keeps the conversation a dating conversation (blocker 05)', () => {
  it('mutual reveal sets anonymousTrust to 2, never null', async () => {
    // B already revealed; A reveals → both. The guard skips a conversation
    // whose anonymousTrust is null, so null here silently disables screening.
    const { s, setAnon } = build([row({
      id: 'm', userOneId: 'A', userTwoId: 'B', revealByTwo: true,
    })]);
    await s.reveal('A', 'B', 'romantic', true);
    expect(setAnon).toContain(2);
    expect(setAnon).not.toContain(null);
  });

  it('a one-sided reveal stays at trust 1 (still anonymous, still screened)', async () => {
    const { s, setAnon } = build([row({ id: 'm', userOneId: 'A', userTwoId: 'B' })]);
    await s.reveal('A', 'B', 'romantic', true);
    expect(setAnon).toEqual([1]);
  });
});
