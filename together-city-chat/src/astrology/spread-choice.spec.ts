import { composeTarot, spreadSize } from './tarot-content';
import { SPREAD_FAN, TarotService } from './tarot.service';

/**
 * A spread is turned, not dealt.
 *
 * The Card of the Day learned this first: a fan of face-down cards in front of
 * a reading that has already happened is theatre, and a citizen finds out by
 * picking differently and getting the same card. The paid spreads had exactly
 * that shape — press the button, receive ten cards — and now they do not.
 *
 * What has to be true for the choice to be real, and what this file checks:
 *
 *   · TURNING DIFFERENT BACKS DEALS DIFFERENT CARDS. If the picks only
 *     reordered a set already decided, the table would be decoration.
 *   · NOTHING IS DRAWN OR CHARGED UNTIL EVERY POSITION IS FILLED. An incomplete
 *     spread is refused rather than completed for the citizen, which is the
 *     whole behaviour being removed.
 *   · EVERY READING EVER STORED STILL REGENERATES. Spreads drawn before picking
 *     existed have no picks in their seed, and they must come back byte for
 *     byte from that seed or the archive is quietly rewritten.
 */

/** A service with a database that records, and a wallet that must never be opened. */
function svc(created: unknown[]) {
  const prisma = {
    tarotReading: {
      create: (a: { data: unknown }) => { created.push(a.data); return Promise.resolve({ id: 'r1' }); },
      findUnique: () => Promise.resolve(null),
      findFirst: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      upsert: () => Promise.resolve(null),
    },
  };
  const financial = {
    assertCanPay: () => { throw new Error('assertCanPay was called for a free reading'); },
    paid: () => { throw new Error('paid() was called for a free reading'); },
  };
  const clock = { timezoneFor: () => Promise.resolve('Asia/Kolkata'), todayIn: () => '2026-08-03' };
  return new TarotService(prisma as never, clock as never, financial as never);
}

describe('the cards are turned by the person they are for', () => {
  it('deals a different spread when different backs are turned', async () => {
    // Same question, same everything except which backs. If these come back
    // equal, the picks are not reaching the deal and the table is a flourish.
    const seedA = 'tarot:three:u1:fixed:picks:0-1-2';
    const seedB = 'tarot:three:u1:fixed:picks:9-4-11';
    const a = composeTarot('three', seedA, 'What should I watch for at work?');
    const b = composeTarot('three', seedB, 'What should I watch for at work?');
    expect(a.cards.map((c) => c.cardId)).not.toEqual(b.cards.map((c) => c.cardId));
    expect(a.picks).toEqual([0, 1, 2]);
    expect(b.picks).toEqual([9, 4, 11]);
  });

  it('has already decided what is under each back before anyone turns one', async () => {
    // THE TABLE IS NOT A SLOT MACHINE. The deck is shuffled from the draw's own
    // entropy and the picks are stripped out before it is hashed, so back #5 is
    // a particular card from the moment the fan is laid — and turning it into
    // Past rather than Future does not change which card it is, or which way up.
    const forward = composeTarot('three', 'tarot:three:u1:fixed:picks:2-5-8');
    const reverse = composeTarot('three', 'tarot:three:u1:fixed:picks:8-5-2');
    expect(forward.cards[0].cardId).toBe(reverse.cards[2].cardId);
    expect(forward.cards[2].cardId).toBe(reverse.cards[0].cardId);
    expect(forward.cards[1].cardId).toBe(reverse.cards[1].cardId);
    expect(forward.cards[0].reversed).toBe(reverse.cards[2].reversed);
  });

  it('never deals the same card into two positions', async () => {
    const celtic = composeTarot('celtic', `tarot:celtic:u1:fixed:picks:${[...Array(10).keys()].map((i) => i * 2).join('-')}`);
    expect(new Set(celtic.cards.map((c) => c.cardId)).size).toBe(10);
  });

  /**
   * THE ARCHIVE, PINNED.
   *
   * No `:picks:` in the seed means the cards came off the top of the deck, and
   * every spread and every Card of the Day in the archive was drawn that way.
   * "My Readings" recomposes from the stored seed, so a change to the shuffle,
   * to the orientation stream, or to how the seed is hashed would silently
   * rewrite readings people already have — including the card somebody was
   * given on a particular day.
   *
   * These three were taken from the code as it stood before picking existed.
   * They are not illustrative; they are the contract. If one of them moves,
   * something in composeTarot changed the past.
   */
  const ARCHIVE: Array<[Parameters<typeof composeTarot>[0], string, Array<[string, boolean]>]> = [
    ['three', 'tarot:three:u1:a1b2c3d4', [['cups-11', false], ['major-18', true], ['pentacles-11', true]]],
    ['celtic', 'tarot:celtic:u1:deadbeef', [
      ['pentacles-11', true], ['cups-4', false], ['wands-6', true], ['pentacles-4', true], ['swords-9', true],
      ['cups-6', false], ['major-1', false], ['cups-11', false], ['wands-5', false], ['major-16', false],
    ]],
    ['daily', 'tarot:daily:u1:2026-08-03:3', [['cups-14', false]]],
  ];
  for (const [kind, seed, expected] of ARCHIVE) {
    it(`regenerates a ${kind} reading drawn before picking existed, card for card`, () => {
      const old = composeTarot(kind, seed, 'Q?');
      expect(old.cards.map((c) => [c.cardId, c.reversed])).toEqual(expected);
      // And it does not claim a choice that was never made.
      expect(old.picks).toBeUndefined();
    });
  }
});

describe('nothing is drawn until every card is turned', () => {
  it('refuses a spread with cards still face down, and saves nothing', async () => {
    const created: unknown[] = [];
    await expect(svc(created).drawSpread('u1', {
      kind: 'celtic', question: 'What should I watch for at work?', picks: [1, 2, 3],
    })).rejects.toThrow(/Turn all 10 cards/);
    // The important half: it did not quietly deal the other seven.
    expect(created).toHaveLength(0);
  });

  it('refuses the same card turned twice', async () => {
    const created: unknown[] = [];
    await expect(svc(created).drawSpread('u1', {
      kind: 'three', question: 'What should I watch for at work?', picks: [3, 3, 7],
    })).rejects.toThrow(/turned twice/);
    expect(created).toHaveLength(0);
  });

  it('refuses a card that was never on the table', async () => {
    const created: unknown[] = [];
    await expect(svc(created).drawSpread('u1', {
      kind: 'three', question: 'What should I watch for at work?', picks: [0, 1, SPREAD_FAN.three],
    })).rejects.toThrow(/not a card on the table/);
    expect(created).toHaveLength(0);
  });

  it('draws once every position is filled, and stores what was turned', async () => {
    const created: Array<{ seed: string; priceInr: number }> = [];
    const out = await svc(created as unknown[]).drawSpread('u1', {
      kind: 'three', question: 'What should I watch for at work?', picks: [5, 0, 11],
    });
    expect(out.cards).toHaveLength(3);
    expect(out.picks).toEqual([5, 0, 11]);
    expect(created).toHaveLength(1);
    // The seed is a complete description of the draw, picks included, so the
    // reading can be regenerated from the row alone years later.
    expect(created[0].seed).toMatch(/:picks:5-0-11$/);
    expect(composeTarot('three', created[0].seed, 'What should I watch for at work?').cards.map((c) => c.cardId))
      .toEqual(out.cards.map((c) => c.cardId));
  });
});

describe('the table and the spread agree about how many cards there are', () => {
  it('lays out more backs than the spread needs, in every spread', () => {
    // A table with exactly as many cards as positions gives the last pick one
    // option, which is not a pick.
    expect(SPREAD_FAN.three).toBeGreaterThan(spreadSize('three'));
    expect(SPREAD_FAN.celtic).toBeGreaterThan(spreadSize('celtic'));
  });

  it('tells the client the same numbers it enforces', () => {
    const listed = svc([]).spreads().spreads;
    expect(listed.find((s) => s.kind === 'three')?.fan).toBe(SPREAD_FAN.three);
    expect(listed.find((s) => s.kind === 'celtic')?.fan).toBe(SPREAD_FAN.celtic);
    expect(listed.find((s) => s.kind === 'daily')?.fan).toBe(TarotService.DAILY_FAN);
    // The route's outer bound has to cover the widest table, or a legitimate
    // pick is rejected at the door before the service ever sees it.
    expect(TarotService.MAX_FAN).toBeGreaterThanOrEqual(SPREAD_FAN.celtic);
  });
});
