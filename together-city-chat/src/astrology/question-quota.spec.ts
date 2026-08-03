import { AstrologyService } from './astrology.service';
import {
  FREE_QUESTIONS, PACK_PRICE_INR, PACK_SIZE, priceForNextQuestion, quotaFor,
} from './question-quota';

/**
 * Five free consultations, then ₹100 for the next five.
 *
 * The arithmetic is small enough to read, so most of this file is not about the
 * arithmetic. It is about the two ways a quota like this gets given away:
 *
 *   · DELETE AND ASK AGAIN. Consultations became deletable in the same week
 *     this price arrived, and if the allowance were `count(AstroQuestion)` then
 *     deleting five answers would return five free questions — for ever, to
 *     anybody who noticed. The counter is on the profile and never goes down.
 *   · PAY TWICE FOR ONE PACK. The charge lands on the question that opens a
 *     pack, so two questions submitted at the same moment both look like the
 *     opener. The claim on the counter is conditional and happens inside the
 *     payment transaction, so the second one finds the counter moved and the
 *     whole charge rolls back.
 */
describe('what a consultation costs', () => {
  it('gives five away, and nothing before the sixth costs anything', () => {
    expect([0, 1, 2, 3, 4].map(priceForNextQuestion)).toEqual([0, 0, 0, 0, 0]);
    expect(quotaFor(0).includedLeft).toBe(5);
    expect(quotaFor(3).includedLeft).toBe(2);
    expect(quotaFor(4).onFreeAllowance).toBe(true);
  });

  it('charges on the question that opens a pack, and on no other', () => {
    // ₹100 buys the 6th consultation AND the four after it.
    expect(priceForNextQuestion(5)).toBe(PACK_PRICE_INR);
    expect([6, 7, 8, 9].map(priceForNextQuestion)).toEqual([0, 0, 0, 0]);
    expect(priceForNextQuestion(10)).toBe(PACK_PRICE_INR);
    expect([11, 12, 13, 14].map(priceForNextQuestion)).toEqual([0, 0, 0, 0]);
    expect(priceForNextQuestion(15)).toBe(PACK_PRICE_INR);
  });

  it('never charges twice inside one pack, however far in somebody is', () => {
    // 200 consultations = the free five plus 39 packs. Not one rupee more.
    const spend = Array.from({ length: 200 }, (_, i) => priceForNextQuestion(i))
      .reduce((a, b) => a + b, 0);
    expect(spend).toBe(((200 - FREE_QUESTIONS) / PACK_SIZE) * PACK_PRICE_INR);
  });

  it('counts down to the next charge, through the free five and through a pack', () => {
    expect(quotaFor(5).includedLeft).toBe(0);   // the next one is the one you pay for
    expect(quotaFor(6).includedLeft).toBe(4);   // ...and it came with four more
    expect(quotaFor(9).includedLeft).toBe(1);
    expect(quotaFor(10).includedLeft).toBe(0);
    expect(quotaFor(6).onFreeAllowance).toBe(false);
  });

  it('is not confused by a number that should not exist', () => {
    // A stale client mid-deploy can hand back undefined; nobody should be
    // charged for that, and nobody should get an infinite allowance either.
    expect(quotaFor(-3)).toEqual(quotaFor(0));
    expect(priceForNextQuestion(5.7)).toBe(PACK_PRICE_INR);
  });
});

/** A profile row with a given counter, and questions the citizen may have deleted. */
function serviceWith(questionsAsked: number | null | undefined, savedQuestions = 0) {
  const prisma = {
    astroProfile: {
      findUnique: () => Promise.resolve({
        id: 'p1', userId: 'u1', birthDate: new Date('1991-06-10T00:00:00Z'), birthTime: '09:45',
        birthCountry: 'India', birthState: 'Karnataka', birthCity: 'Bengaluru',
        timeZone: 'Asia/Kolkata', lat: 12.97, lng: 77.59, updatedAt: new Date(),
        questionsAsked,
      }),
      upsert: () => Promise.resolve(null),
      update: () => Promise.resolve(null),
    },
    astroQuestion: {
      findMany: () => Promise.resolve(Array.from({ length: savedQuestions }, (_, i) => ({
        id: `q${i}`, userId: 'u1', topic: 'Career', question: 'q', answer: 'a',
        priceInr: 0, createdAt: new Date(),
      }))),
      create: () => Promise.resolve(null),
      deleteMany: () => Promise.resolve({ count: 1 }),
    },
    astroReading: {
      findUnique: () => Promise.resolve(null), upsert: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]), deleteMany: () => Promise.resolve(null),
    },
    user: { findUnique: () => Promise.resolve({ name: 'Somen Kumar' }) },
    datingProfile: { findUnique: () => Promise.resolve(null) },
  };
  const financial = {
    assertCanPay: () => { throw new Error('assertCanPay reached on a read'); },
    paid: () => { throw new Error('paid() reached on a read'); },
  };
  return new AstrologyService(
    prisma as never, { get: () => Promise.resolve(null) } as never, financial as never,
    { enabled: false, json: () => Promise.resolve({}) } as never,
  );
}

describe('the allowance survives the delete button', () => {
  it('reads the counter, not the rows', async () => {
    // Five consultations given, every one of them since deleted. The counter is
    // what is asked, so the sixth still costs ₹100. If this ever fails, the
    // quota has been re-derived from something a citizen can erase.
    const svc = serviceWith(5, 0);
    expect(await svc.askQuota('u1')).toMatchObject({ asked: 5, priceInr: PACK_PRICE_INR, includedLeft: 0 });
  });

  it('does not give the allowance back when a consultation is deleted', async () => {
    const svc = serviceWith(5, 3);
    const before = await svc.askQuota('u1');
    await svc.deleteQuestion('u1', 'q1');
    await svc.deleteQuestion('u1', 'q2');
    expect(await svc.askQuota('u1')).toEqual(before);
  });

  it('treats a counter the client cannot see as nothing asked, not as nothing owed', async () => {
    // Mid-deploy the generated client can predate the column and hand back
    // undefined. Free is the right way to be wrong about that: it costs us one
    // consultation, where the other direction bills somebody ₹100 for a bug.
    const svc = serviceWith(undefined);
    expect(await svc.askQuota('u1')).toMatchObject({ asked: 0, priceInr: 0, includedLeft: FREE_QUESTIONS });
  });
});
