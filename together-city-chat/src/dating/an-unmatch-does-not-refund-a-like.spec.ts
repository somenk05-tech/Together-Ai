/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── AN UNMATCH DOES NOT REFUND A LIKE (launch gate, third reading, 4 Sep,
 *    blocker 1) ───────────────────────────────────────────────────────────
 *
 * `unmatch` took ANY row the pair shared and blanked `likedAt*` on it. Two
 * things read those timestamps: `likeAllowance` counts the day's likes by
 * them, and `like()` decides whether to push "You have a new like 💛" by
 * whether one was ever set. So like → unmatch → like was a loop with no
 * cost and a push at every turn — the one `pass()` was rewritten to close
 * on 31 Aug, standing open one door along.
 *
 * Two rules now, both pinned here:
 *   · a row that never matched cannot be unmatched — nothing to end, nothing
 *     written, the same `{ ok: true }` as no row at all;
 *   · a real unmatch clears the like FLAGS and keeps the TIMESTAMPS, the way
 *     a pass does. Spent stays spent; a re-given like is not news.
 */

type Row = Record<string, any>;
const row = (o: Row): Row => ({
  kind: 'romantic', status: 'pending', likedByOne: false, likedByTwo: false,
  passedByOne: false, passedByTwo: false, likedAtOne: null, likedAtTwo: null,
  passedAtOne: null, passedAtTwo: null, superByOne: false, superByTwo: false,
  revealByOne: false, revealByTwo: false, conversationId: null, updatedAt: new Date('2026-09-04T00:00:00Z'), ...o,
});

function build(rows: Row[]) {
  const pushes: string[] = [];
  const updates: any[] = [];
  const s: any = Object.create(DatingService.prototype);
  s.prisma = {
    datingMatch: {
      rows,
      findFirst: async ({ where }: any = {}) => {
        const w = where?.OR ? where.OR[0] : where;
        return rows.find((r) => r.userOneId === w.userOneId && r.userTwoId === w.userTwoId && (!where.kind || r.kind === where.kind)) ?? null;
      },
      findMany: async ({ where }: any = {}) => rows.filter((r) => where.OR.some((c: any) =>
        (c.userOneId ? r.userOneId === c.userOneId && r.likedAtOne && r.likedAtOne >= c.likedAtOne.gte : false)
        || (c.userTwoId ? r.userTwoId === c.userTwoId && r.likedAtTwo && r.likedAtTwo >= c.likedAtTwo.gte : false))),
      update: async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id)!; updates.push(data); Object.assign(r, data); return r; },
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter((r) => r.id === where.id && r.status !== where.status?.not);
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
  };
  s.assertMayReach = async () => undefined;
  s.assertWritable = async () => undefined;
  s.assertReachable = async () => undefined;
  s.bumpListVersion = async () => undefined;
  s.cachePairScore = async () => undefined;
  s.upsertState = async (a: string, b: string, kind: string) => {
    const [userOneId, userTwoId] = [a, b].sort();
    let r = rows.find((x) => x.userOneId === userOneId && x.userTwoId === userTwoId && x.kind === kind);
    if (!r) { r = row({ id: `m${rows.length + 1}`, userOneId, userTwoId, kind }); rows.push(r); }
    return { ...r }; // a snapshot, as Prisma returns one — not a live reference
  };
  s.analytics = { track: () => undefined };
  s.clock = { timezoneFor: async () => 'Asia/Kolkata', startOfDayIn: () => new Date('2026-09-04T00:00:00Z'), todayIn: () => '2026-09-04' };
  s.notifications = { create: async (n: any) => { pushes.push(n.kind); return {}; } };
  s.conversations = { archiveForAll: async () => undefined };
  return { s, rows, pushes, updates };
}

describe('an unmatch does not refund a like', () => {
  it('a row that never matched cannot be unmatched — nothing is written', async () => {
    const { s, updates, pushes } = build([]);
    await s.like('A', 'B', 'romantic');            // creates the pending row, one push
    expect(pushes).toEqual(['dating_like']);
    const likedAt = s.prisma.datingMatch.rows[0].likedAtOne;
    expect(likedAt).toBeInstanceOf(Date);

    await expect(s.unmatch('A', 'B', 'romantic')).resolves.toEqual({ ok: true });
    // The like is still on the row: still spent, still remembered.
    expect(s.prisma.datingMatch.rows[0].likedByOne).toBe(true);
    expect(s.prisma.datingMatch.rows[0].likedAtOne).toBe(likedAt);
    expect(updates.filter((d) => d.status === 'passed')).toHaveLength(0);

    await s.like('A', 'B', 'romantic');            // a re-tap on a standing like
    expect(pushes).toEqual(['dating_like']);        // nobody is told twice
  });

  it('a real unmatch clears the flags and keeps the timestamps', async () => {
    const t0 = new Date('2026-09-04T09:00:00Z');
    const { s, rows } = build([row({
      id: 'm', userOneId: 'A', userTwoId: 'B', status: 'matched', conversationId: 'c1',
      likedByOne: true, likedByTwo: true, likedAtOne: t0, likedAtTwo: t0,
    })]);
    await s.unmatch('A', 'B', 'romantic');
    expect(rows[0].status).toBe('passed');
    expect(rows[0].likedByOne).toBe(false);
    expect(rows[0].likedByTwo).toBe(false);
    expect(rows[0].likedAtOne).toBe(t0);
    expect(rows[0].likedAtTwo).toBe(t0);
  });

  it('like → unmatch → like, fifty times, is one spent like and one push', async () => {
    const { s, rows, pushes } = build([row({
      id: 'm', userOneId: 'A', userTwoId: 'B', status: 'matched', conversationId: 'c1',
      likedByOne: true, likedByTwo: true, likedAtOne: new Date('2026-09-04T09:00:00Z'), likedAtTwo: new Date('2026-09-04T09:00:00Z'),
    })]);
    for (let i = 0; i < 50; i += 1) {
      await s.unmatch('A', 'B', 'romantic');
      await s.like('A', 'B', 'romantic');
    }
    expect(pushes).toEqual([]);                     // never news: A liked B before
    const left = await s.likeAllowance('A');
    expect(left.likesUsed).toBe(1);                 // one row, one like, however many turns
    expect(rows).toHaveLength(1);
  });
});
