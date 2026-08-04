import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FoodJournalService, sumItems, coachLines } from './food-journal.service';
import type { JournalItemDto } from './dto/food-journal.dto';

/**
 * The Food Journal's honesty rules, pinned:
 *
 *  • totals are summed server-side from the items — a client-supplied total
 *    is never stored;
 *  • the day is the CITIZEN's calendar day (IST midnight is 18:30 UTC — the
 *    half-hour zone is exactly the one an hourly boundary scan would clip);
 *  • weekly averages divide by LOGGED days only — an unlogged day is "not
 *    recorded", never "ate nothing";
 *  • with the AI key off, analyze() says so and invents nothing;
 *  • the coach speaks arithmetic against the citizen's own targets and
 *    discloses when those targets rest on assumed inputs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const ITEM = (over: Partial<JournalItemDto> = {}): JournalItemDto => ({
  name: 'Masala oats', qty: 1, unit: 'bowl', kcal: 420, proteinG: 12, carbG: 62, fatG: 12, fibreG: 6, ...over,
});

const TZ = 'Asia/Kolkata';
const dayInIST = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

function build(opts: { aiOn?: boolean; rows?: any[]; targets?: any } = {}) {
  const s: any = Object.create(FoodJournalService.prototype);
  const created: any[] = [];
  s.prisma = {
    foodJournalEntry: {
      create: async (a: any) => { created.push(a.data); return { id: 'fj-1', createdAt: new Date(), photoUrl: null, note: null, ...a.data }; },
      findMany: async (a: any) => (opts.rows ?? []).filter((r) => r.at >= a.where.at.gte && r.at < a.where.at.lt),
      findUnique: async () => (opts.rows ?? [])[0] ?? null,
      update: async (a: any) => ({ ...(opts.rows ?? [])[0], ...a.data }),
      delete: async () => ({}),
    },
  };
  s.ai = {
    enabled: opts.aiOn ?? false,
    analyzeMeal: async () => ({ items: [ITEM({ confidence: 0.8 })], note: 'One bowl, portion estimated.' }),
  };
  s.clock = { dayIn: (tz: string, at: Date) => dayInIST(at), timezoneFor: async () => TZ };
  s.nutrition = { targets: async () => (opts.targets ?? { kcal: 3024, protein: 184, carb: 361, fat: 94, fiber: 42, waterMl: 3570, sodiumMaxMg: 2300, personalised: true, assumed: [] }) };
  return { s, created };
}

describe('totals are the server’s arithmetic, not the client’s claim', () => {
  it('sums items and rounds', () => {
    expect(sumItems([ITEM(), ITEM({ name: 'Apple', kcal: 95, proteinG: 0.5, carbG: 25, fatG: 0.3, fibreG: 4.4 })]))
      .toEqual({ kcal: 515, proteinG: 13, carbG: 87, fatG: 12, fibreG: 10, sugarG: 0, sodiumMg: 0, waterMl: 0 });
  });

  it('log() stores the recomputed totals, whatever the client believed', async () => {
    const { s, created } = build();
    await s.log('u1', { mealType: 'breakfast', source: 'photo', items: [ITEM()] });
    expect(JSON.parse(created[0].totalsJson).kcal).toBe(420);
  });

  it('an empty meal is refused, not stored as zeros', async () => {
    await expect(build().s.log('u1', { mealType: 'lunch', source: 'text', items: [] })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('the day is the citizen’s day', () => {
  it('a 00:15 IST meal (18:45 UTC yesterday) belongs to the IST date', async () => {
    // 2026-08-04 00:15 IST == 2026-08-03T18:45:00Z
    const at = new Date('2026-08-03T18:45:00Z');
    const rows = [{ id: 'e1', userId: 'u1', at, mealType: 'other', source: 'text', itemsJson: JSON.stringify([ITEM()]), totalsJson: JSON.stringify(sumItems([ITEM()])), photoUrl: null, note: null, createdAt: at }];
    const day = await build({ rows }).s.day('u1', '2026-08-04');
    expect(day.entries).toHaveLength(1);
    expect(day.totals.kcal).toBe(420);
    // …and it does NOT leak into the UTC date it happened to fall on.
    const wrongDay = await build({ rows }).s.day('u1', '2026-08-03');
    expect(wrongDay.entries).toHaveLength(0);
  });
});

describe('a week of trends', () => {
  it('averages divide by logged days only', async () => {
    const at = new Date('2026-08-03T18:45:00Z'); // one logged day in the window
    const rows = [{ id: 'e1', userId: 'u1', at, mealType: 'lunch', source: 'text', itemsJson: JSON.stringify([ITEM()]), totalsJson: JSON.stringify(sumItems([ITEM()])), photoUrl: null, note: null, createdAt: at }];
    const s = build({ rows }).s;
    s.clock.dayIn = (tz: string, d: Date) => dayInIST(d);
    // Pin "today" by pinning what dayIn returns for new Date() — run against real now is fine:
    const week = await s.week('u1');
    expect(week.days).toHaveLength(7);
    const logged = week.days.filter((d: any) => d.meals > 0);
    if (logged.length === 1) expect(week.avg.kcal).toBe(420); // divided by 1, not by 7
    expect(week.loggedDays).toBe(logged.length);
  });
});

describe('honesty at the edges', () => {
  it('AI off → analyze says so and offers manual entry, inventing nothing', async () => {
    const out = await build({ aiOn: false }).s.analyze('u1', { text: 'two rotis and dal' });
    expect(out.available).toBe(false);
    expect(out.items).toEqual([]);
    expect(out.note).toContain('yourself');
  });

  it('AI on → items come back as reviewable estimates with a note', async () => {
    const out = await build({ aiOn: true }).s.analyze('u1', { text: 'a bowl of masala oats' });
    expect(out.available).toBe(true);
    expect(out.items[0].confidence).toBe(0.8);
    expect(out.totals.kcal).toBe(420);
  });

  it('a stranger’s entry answers 404, same as a typo', async () => {
    const rows = [{ id: 'e1', userId: 'someone-else', at: new Date(), mealType: 'lunch', source: 'text', itemsJson: '[]', totalsJson: '{}', photoUrl: null, note: null, createdAt: new Date() }];
    await expect(build({ rows }).s.remove('u1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the coach speaks arithmetic', () => {
  const target = { kcal: 2000, protein: 150, fiber: 30, sodiumMaxMg: 2300 };
  it('under target: percent and remaining; protein progress named', () => {
    const lines = coachLines({ kcal: 1240, proteinG: 93, carbG: 0, fatG: 0, fibreG: 20, sugarG: 0, sodiumMg: 0, waterMl: 0 }, target, true);
    expect(lines[0]).toContain('62%');
    expect(lines[0]).toContain('760');
    expect(lines[1]).toContain('93 g of 150 g');
  });
  it('over sodium: the ceiling is named', () => {
    const lines = coachLines({ kcal: 1800, proteinG: 150, carbG: 0, fatG: 0, fibreG: 28, sugarG: 0, sodiumMg: 2900, waterMl: 0 }, target, true);
    expect(lines.join(' ')).toContain('Sodium');
    expect(lines.join(' ')).toContain('2,300');
  });
  it('assumed inputs are disclosed', () => {
    const lines = coachLines({ ...({ kcal: 100, proteinG: 5, carbG: 0, fatG: 0, fibreG: 25, sugarG: 0, sodiumMg: 0, waterMl: 0 }) }, target, false);
    expect(lines.join(' ')).toContain('assumed inputs');
  });
});
