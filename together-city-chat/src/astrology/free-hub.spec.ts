import { SPREAD_PRICE_INR } from './tarot.service';
import { priceForNextQuestion } from './question-quota';

/**
 * The cards charge nothing, and nothing pretends to.
 *
 * The paywall came down: the Celtic Cross was ₹149, Past·Present·Future ₹49,
 * and a consultation ₹75. The spreads are still free. Consultations have since
 * been given a price again — five free, then ₹100 for the next five — and the
 * only thing this file asserts about them is that the first five really are
 * free, so a price coming back for one part of the hub cannot quietly return
 * for the rest.
 *
 * THE PRICE BEING ZERO IS NOT THE INTERESTING PART. The interesting part is
 * that the payment path is SKIPPED rather than called with a zero, and this
 * file exists for that. `paid(..., amountInr: 0)` would have been the smaller
 * change and the wrong one, twice over:
 *
 *   · `assertCanPay` returns early for method `card` only after checking a card
 *     is linked — so a citizen with no card on file would be refused a FREE
 *     reading, which is an error message about money on a screen that has
 *     stopped asking for any;
 *   · `charge()` would write a ₹0 line into the wallet ledger for every draw.
 *     A statement full of zero-rupee entries is a worse record than no entry,
 *     and the Financial hub is where somebody goes to find out what they spent.
 *
 * So the test is not "is the price zero". It is "does a zero price mean the
 * wallet is never opened".
 */
describe('the tarot readings charge nothing for now', () => {
  it('every spread is zero, and the first consultation is too', () => {
    expect(SPREAD_PRICE_INR.daily).toBe(0);
    expect(SPREAD_PRICE_INR.three).toBe(0);
    expect(SPREAD_PRICE_INR.celtic).toBe(0);
    expect(priceForNextQuestion(0)).toBe(0);
  });

  it('a free draw never opens the wallet', async () => {
    const { TarotService } = await import('./tarot.service');
    const created: unknown[] = [];
    const prisma = {
      tarotReading: {
        create: (a: { data: unknown }) => { created.push(a.data); return Promise.resolve({ id: 'r1' }); },
        findUnique: () => Promise.resolve(null),
        findFirst: () => Promise.resolve(null),
        findMany: () => Promise.resolve([]),
        upsert: () => Promise.resolve(null),
      },
    };
    // A financial service that fails loudly if anything reaches it. This is the
    // whole assertion: not that the charge was zero, but that there was none.
    const financial = {
      assertCanPay: () => { throw new Error('assertCanPay was called for a free reading'); },
      paid: () => { throw new Error('paid() was called for a free reading'); },
    };
    const clock = { timezoneFor: () => Promise.resolve('Asia/Kolkata'), todayIn: () => '2026-08-03' };
    const svc = new TarotService(prisma as never, clock as never, financial as never);

    const out = await svc.drawSpread('u1', { kind: 'three', question: 'What should I watch for at work?', picks: [4, 0, 9] });
    expect(out.priceInr).toBe(0);
    expect(out.cards).toHaveLength(3);
    expect(created).toHaveLength(1);
    expect((created[0] as { priceInr: number }).priceInr).toBe(0);
  });

  it('still refuses a question the cards cannot answer', async () => {
    // Free does not mean unvalidated. Removing a price is not removing a rule.
    const { TarotService } = await import('./tarot.service');
    const prisma = { tarotReading: { create: () => Promise.resolve({ id: 'r1' }) } };
    const financial = { assertCanPay: () => Promise.resolve(), paid: () => Promise.reject(new Error('no')) };
    const clock = { timezoneFor: () => Promise.resolve('Asia/Kolkata'), todayIn: () => '2026-08-03' };
    const svc = new TarotService(prisma as never, clock as never, financial as never);

    await expect(svc.drawSpread('u1', { kind: 'three', question: 'hi', picks: [4, 0, 9] })).rejects.toThrow();
    await expect(svc.drawSpread('u1', { kind: 'three', question: 'x'.repeat(301), picks: [4, 0, 9] })).rejects.toThrow();
  });
});
