/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotificationsService } from './notifications.service';

/**
 * ── THERE WAS NO FIFTY-FIRST NOTIFICATION (fifth audit, 29 Aug) ────────────
 *
 * `listFor(userId, limit = 50)` took a limit, `notifications.controller.ts`
 * passed none, and the route offered nothing else — so the fifty-first
 * notification an account ever received was unreachable for the life of that
 * account. And nothing swept the table: `purge-plan.ts` covers account
 * DELETION and the retention sweep covered four credential tables, so a live
 * account's rows accumulated for ever, one per like, per match, per verdict.
 */
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `n${String(i).padStart(4, '0')}`, kind: 'like', title: `t${i}`, body: null, href: null, read: false,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n - i)),
}));

/** The predicate the service builds, applied the way Postgres would. */
function matches(where: any, r: any): boolean {
  if (!where.OR) return true;
  return where.OR.some((c: any) => {
    if (c.createdAt?.lt) return r.createdAt < c.createdAt.lt;
    if (c.createdAt instanceof Date) return r.createdAt.getTime() === c.createdAt.getTime() && r.id < c.id.lt;
    return false;
  });
}

function build(all: any[]) {
  const seen: any[] = [];
  const svc: any = Object.create(NotificationsService.prototype);
  svc.prisma = {
    notification: {
      findMany: async (a: any) => {
        seen.push(a);
        return [...all]
          .sort((x, y) => (y.createdAt.getTime() - x.createdAt.getTime()) || (x.id < y.id ? 1 : -1))
          .filter((r) => matches(a.where, r))
          .slice(0, a.take);
      },
    },
  };
  return { svc, seen };
}

describe('the bell can be read past its first page', () => {
  it('returns a page, and the page is capped however large the ask', async () => {
    const { svc, seen } = build(rowsOf(300));
    expect(await svc.listFor('u1', 5000)).toHaveLength(100);
    expect(seen[0].take).toBe(100);
  });

  it('a cursor reaches the ones after it', async () => {
    const all = rowsOf(120);
    const { svc } = build(all);
    const first = await svc.listFor('u1', 50);
    const tail = first[first.length - 1];
    const second = await svc.listFor('u1', 50, tail.createdAt, tail.id);
    expect(first).toHaveLength(50);
    expect(second[0].id).not.toBe(first[0].id);
    // Keyset, so nothing is repeated across the boundary.
    expect(second.map((n: any) => n.id)).not.toContain(tail.id);
  });

  /**
   * ── THE ROW THE FIRST VERSION LOST (re-audit, 29 Aug) ────────────────────
   *
   * The cursor carried only `createdAt` and the id tie-break lived only in the
   * ORDER BY, where it cannot filter. Two rows sharing the boundary
   * millisecond, a page ending on the first of them, and the second was asked
   * for with `< T`, excluded, and unreachable for ever — the same defect this
   * paging was written to remove, one line further down.
   */
  it('does not lose a row that shares the boundary millisecond', async () => {
    const t = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const all = [
      { id: 'b', createdAt: t, kind: 'like', title: 'b', body: null, href: null, read: false },
      { id: 'a', createdAt: t, kind: 'like', title: 'a', body: null, href: null, read: false },
      { id: 'z', createdAt: new Date(t.getTime() - 1000), kind: 'like', title: 'z', body: null, href: null, read: false },
    ];
    const { svc } = build(all);
    const first = await svc.listFor('u1', 1);
    expect(first.map((n: any) => n.id)).toEqual(['b']);
    const second = await svc.listFor('u1', 2, first[0].createdAt, first[0].id);
    expect(second.map((n: any) => n.id)).toEqual(['a', 'z']);
  });

  it('and a cursor without its id still pages, just without the tie-break', async () => {
    // Older clients send one half. They must not get an error; they get the
    // previous behaviour, which is right except at an exact tie.
    const { svc } = build(rowsOf(10));
    const first = await svc.listFor('u1', 3);
    const second = await svc.listFor('u1', 3, first[2].createdAt);
    expect(second).toHaveLength(3);
  });

  it('orders by the pair, because two notifications can share a millisecond', async () => {
    const { svc, seen } = build(rowsOf(10));
    await svc.listFor('u1');
    expect(seen[0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('ignores a cursor that is not a date rather than returning nothing', async () => {
    const { svc, seen } = build(rowsOf(10));
    await svc.listFor('u1', 50, 'not-a-date');
    expect(seen[0].where.OR).toBeUndefined();
  });

  it('and still hands back an array, because the clients deploy separately', async () => {
    const { svc } = build(rowsOf(3));
    expect(Array.isArray(await svc.listFor('u1'))).toBe(true);
  });
});

describe('and it does not grow for ever', () => {
  const retention = readFileSync(join(__dirname, '..', 'tasks', 'retention.service.ts'), 'utf8');

  it('the nightly sweep takes old notifications too', () => {
    expect(retention).toMatch(/\['notification', this\.sweep\(db\.notification/);
  });

  it('READ ones only — an unread one is something the citizen has not seen yet', () => {
    const fn = retention.slice(retention.indexOf("['notification'"), retention.indexOf("['notification'") + 400);
    expect(fn).toMatch(/read: true/);
  });

  it('on its own, much longer clock than a credential', () => {
    // A stale refresh token is worthless after a week; a notification is
    // somebody's record of what happened to them.
    expect(retention).toMatch(/NOTIFICATION_DAYS = 90/);
    expect(retention).toMatch(/const GRACE_DAYS = 7;/);
  });
});
