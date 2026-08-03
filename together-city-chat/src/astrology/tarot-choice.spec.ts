import { composeTarot } from './tarot-content';

/**
 * The choice has to be a choice.
 *
 * Card of the Day used to be dealt the moment the page loaded. The screen now
 * offers seven face-down cards to pick from, and that is only honest if three
 * things hold: the position genuinely changes the card, nothing is dealt or
 * stored before somebody picks, and a pick cannot be retaken.
 *
 * The first is arithmetic and is tested here. The other two are the service's,
 * and are tested through it below with a prisma stand-in — they are the ones
 * worth the scaffolding, because a spread you can reroll until you like the
 * answer is exactly the sort of thing that works perfectly in a demo.
 */
describe('the daily card is chosen, not dealt', () => {
  const seedAt = (user: string, day: string, position: number) => `tarot:daily:${user}:${day}:${position}`;

  it('a different position is a different card', () => {
    const drawn = Array.from({ length: 7 }, (_, i) =>
      composeTarot('daily', seedAt('u1', '2026-08-03', i)).cards[0]);
    const distinct = new Set(drawn.map((c) => `${c.cardId}:${c.reversed}`));
    // Seven draws from 78 cards and two orientations. Collisions are possible
    // and fine — what would not be fine is one card seven times, which is what
    // a fan over a pre-dealt card looks like from the inside.
    expect(distinct.size).toBeGreaterThanOrEqual(5);
    expect(drawn[0].cardId).not.toBe(drawn[3].cardId);
  });

  it('the same position on the same day is the same card, for ever', () => {
    const a = composeTarot('daily', seedAt('u1', '2026-08-03', 4));
    const b = composeTarot('daily', seedAt('u1', '2026-08-03', 4));
    expect(b.cards[0]).toEqual(a.cards[0]);
    expect(b.seed).toBe(a.seed);
  });

  it('the same position on a different day, or for a different person, is not', () => {
    const mine = composeTarot('daily', seedAt('u1', '2026-08-03', 4)).cards[0];
    expect(composeTarot('daily', seedAt('u1', '2026-08-04', 4)).cards[0].cardId).not.toBe(mine.cardId);
    expect(composeTarot('daily', seedAt('u2', '2026-08-03', 4)).cards[0].cardId).not.toBe(mine.cardId);
  });

  it('a daily reading is one card and carries its disclaimer', () => {
    const r = composeTarot('daily', seedAt('u1', '2026-08-03', 0));
    expect(r.cards).toHaveLength(1);
    expect(r.disclaimer.length).toBeGreaterThan(40);
  });
});

/** A prisma stand-in that records every write. */
function fakeDb() {
  const rows = new Map<string, { userId: string; kind: string; period: string; seed: string; readingJson: string; createdAt: Date }>();
  const writes: string[] = [];
  const key = (userId: string, kind: string, period: string) => `${userId}|${kind}|${period}`;
  return {
    writes,
    rows,
    prisma: {
      tarotReading: {
        findUnique: (a: { where: { userId_kind_period: { userId: string; kind: string; period: string } } }) => {
          const k = a.where.userId_kind_period;
          return Promise.resolve(rows.get(key(k.userId, k.kind, k.period)) ?? null);
        },
        findFirst: () => Promise.resolve([...rows.values()].sort((x, y) => +y.createdAt - +x.createdAt)[0] ?? null),
        findMany: () => Promise.resolve([...rows.values()]),
        upsert: (a: {
          where: { userId_kind_period: { userId: string; kind: string; period: string } };
          create: { userId: string; kind: string; period: string; seed: string; readingJson: string };
        }) => {
          const k = a.where.userId_kind_period;
          const id = key(k.userId, k.kind, k.period);
          if (!rows.has(id)) {
            writes.push(a.create.seed);
            rows.set(id, { ...a.create, createdAt: new Date('2026-08-03T06:00:00Z') });
          }
          return Promise.resolve(rows.get(id));
        },
      },
    },
  };
}

const clock = { timezoneFor: () => Promise.resolve('Asia/Kolkata'), todayIn: () => '2026-08-03' };

describe('turning a card', () => {
  // Imported lazily so the module's Nest decorators are evaluated once, here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TarotService } = require('./tarot.service') as typeof import('./tarot.service');
  const build = (prisma: unknown) => new TarotService(prisma as never, clock as never, {} as never);

  it('deals nothing and stores nothing until somebody picks', async () => {
    const db = fakeDb();
    const out = await build(db.prisma).dailyCard('u1') as Record<string, unknown>;

    expect(out.chosen).toBe(false);
    expect(out.fan).toBe(TarotService.DAILY_FAN);
    expect(out.cards).toBeUndefined();     // no card exists yet
    expect(db.writes).toEqual([]);         // and nothing was written to find out
    // The disclaimer is on the empty state too — somebody deciding whether to
    // turn a card should have read it before they do.
    expect(String(out.disclaimer).length).toBeGreaterThan(40);
  });

  it('gives you the card you picked', async () => {
    const db = fakeDb();
    const out = await build(db.prisma).chooseDailyCard('u1', 3) as Record<string, unknown>;
    const expected = composeTarot('daily', 'tarot:daily:u1:2026-08-03:3').cards[0];

    expect(out.chosen).toBe(true);
    expect((out.cards as Array<{ cardId: string }>)[0].cardId).toBe(expected.cardId);
    expect(out.position).toBe(3);
    expect(db.writes).toHaveLength(1);
  });

  it('will not let you turn a second card, and will not pretend it did', async () => {
    const db = fakeDb();
    const svc = build(db.prisma);
    const first = await svc.chooseDailyCard('u1', 3) as Record<string, unknown>;
    const second = await svc.chooseDailyCard('u1', 6) as Record<string, unknown>;

    // Not "position 6 rejected" — position 6 is simply not what happened today.
    expect(second.position).toBe(3);
    expect(second.cards).toEqual(first.cards);
    expect(db.writes).toHaveLength(1);   // no second write, so no reroll
  });

  it('shows the turned card on the next load', async () => {
    const db = fakeDb();
    const svc = build(db.prisma);
    await svc.chooseDailyCard('u1', 2);
    const out = await svc.dailyCard('u1') as Record<string, unknown>;

    expect(out.chosen).toBe(true);
    expect(out.position).toBe(2);
    expect(db.writes).toHaveLength(1);
  });

  it('refuses a position that is not on the table', async () => {
    const db = fakeDb();
    const svc = build(db.prisma);
    await expect(svc.chooseDailyCard('u1', TarotService.DAILY_FAN)).rejects.toThrow();
    await expect(svc.chooseDailyCard('u1', -1)).rejects.toThrow();
    await expect(svc.chooseDailyCard('u1', 1.5)).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });
});
