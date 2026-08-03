import { TarotService } from './tarot.service';

/**
 * A reading is the citizen's to delete — except one.
 *
 * The Card of the Day is deliberately un-retakeable: nothing is dealt until a
 * back is turned, the first turn is written with `update: {}`, and the card is
 * yours until midnight. **All of that is enforced by the existence of the row.**
 * Delete today's row and `todaysCard()` finds nothing, so the fan comes back and
 * anybody who disliked their card can delete-and-redraw until they get one they
 * like. That is not a delete button. It is a reroll button wearing one's label.
 *
 * So today's daily card is refused and every other reading goes. Yesterday's
 * card has no such problem — the day it belonged to is over.
 *
 * This is the same shape as the consultation allowance: a rule enforced by a row
 * a citizen can remove is not a rule.
 */

const TODAY = '2026-08-03';

function svc(row: Record<string, unknown> | null) {
  const deleted: unknown[] = [];
  const prisma = {
    tarotReading: {
      findFirst: () => Promise.resolve(row),
      deleteMany: (a: { where: unknown }) => { deleted.push(a.where); return Promise.resolve({ count: 1 }); },
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      create: () => Promise.resolve({ id: 'r1' }),
      upsert: () => Promise.resolve(null),
    },
  };
  const clock = { timezoneFor: () => Promise.resolve('Asia/Kolkata'), todayIn: () => TODAY };
  const financial = { assertCanPay: () => Promise.resolve(), paid: () => Promise.reject(new Error('no')) };
  return { s: new TarotService(prisma as never, clock as never, financial as never), deleted };
}

const reading = (over: Record<string, unknown> = {}) => ({
  id: 'r1', userId: 'u1', kind: 'three', period: null, question: 'What about work?',
  seed: 'tarot:three:u1:abcd', readingJson: '{}', priceInr: 0, createdAt: new Date(), ...over,
});

describe('deleting a reading', () => {
  it('deletes a spread, scoped to its owner in the WHERE clause', async () => {
    const { s, deleted } = svc(reading());
    expect(await s.deleteReading('u1', 'r1')).toEqual({ deleted: true });
    // Scoped in the statement, not checked first and deleted after: two
    // statements can be raced, one cannot.
    expect(deleted[0]).toEqual({ id: 'r1', userId: 'u1' });
  });

  it('refuses a reading that is not yours, without saying whose it is', async () => {
    const { s, deleted } = svc(null);
    await expect(s.deleteReading('u2', 'r1')).rejects.toThrow(/not there to delete/);
    expect(deleted).toHaveLength(0);
  });

  it('REFUSES today\'s Card of the Day, and says why', async () => {
    const { s, deleted } = svc(reading({
      kind: 'daily', period: TODAY,
      readingJson: JSON.stringify({ tz: 'Asia/Kolkata', cards: [], seed: 'x' }),
    }));
    await expect(s.deleteReading('u1', 'r1')).rejects.toThrow(/stays until midnight/);
    // The important half. If this row ever goes, the day can be redrawn.
    expect(deleted).toHaveLength(0);
  });

  it('lets yesterday\'s card go — that day is over', async () => {
    const { s, deleted } = svc(reading({
      kind: 'daily', period: '2026-08-02',
      readingJson: JSON.stringify({ tz: 'Asia/Kolkata', cards: [], seed: 'x' }),
    }));
    expect(await s.deleteReading('u1', 'r1')).toEqual({ deleted: true });
    expect(deleted).toHaveLength(1);
  });

  it('judges "today" in the zone the card was drawn in, not the server\'s', async () => {
    // A citizen who has flown somewhere has a different "today". The stored
    // reading carries its own zone for exactly this reason — the same guard the
    // draw itself uses, applied to the delete.
    const { s } = svc(reading({
      kind: 'daily', period: TODAY,
      readingJson: JSON.stringify({ tz: 'Pacific/Auckland', cards: [], seed: 'x' }),
    }));
    await expect(s.deleteReading('u1', 'r1')).rejects.toThrow(/stays until midnight/);
  });
});
