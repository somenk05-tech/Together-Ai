import { MiraService } from './mira.service';
import { persona, lifePathOf, FREE_CHATS, SUB_INR, PAYWALL_LINE } from './persona';
import { violations } from './voice';

/**
 * MIRA CAN ACTUALLY TALK — the phase the service docstring always promised.
 *
 * The owner's screenshots said it plainly: "i am feeling low" → "Yeah. What's
 * going on?" → "just feeling lonely" → "That's not something I can do yet."
 * A companion that forgets the previous sentence and deflects the next one is
 * not a companion. The model now speaks in exactly two lanes — LISTEN, and
 * the nothing-matched fallback — and everything load-bearing stays in code:
 *
 *   · the meter is checked BEFORE the model is called, and only model turns
 *     are counted — the working city stays free;
 *   · her voice rules outrank the model — a reply that breaks them is
 *     dropped and the deterministic sentence stands;
 *   · with no key configured she is byte-for-byte the phase-1 Mira, which is
 *     what keeps every older spec in this folder true.
 *
 * CHECKED AGAINST THE OLD CODE: with the converse() calls removed from the
 * service, the first two cases fail — she deflects instead of talking.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bare(over: Partial<Record<string, any>> = {}) {
  const svc: any = Object.create(MiraService.prototype);
  svc.logger = { warn: () => undefined, log: () => undefined };
  svc.registry = { upTo: () => [], byId: () => undefined, all: () => [] };
  svc.ledger = { record: () => undefined };
  svc.ai = { enabled: true, converse: async () => 'Lonely evenings are the worst kind of quiet. What happened today?' };
  svc.prisma = {
    miraPass: {
      findUnique: async () => null,
      upsert: async (args: any) => { svc.__upserts = [...(svc.__upserts ?? []), args]; },
    },
    user: { findUnique: async () => ({ name: 'Somen Kumar' }) },
  };
  svc.astrology = { getProfile: async () => ({ chart: { sunSign: 'Leo', moonSign: 'Cancer', ascendant: 'Virgo' } }) };
  svc.financial = { paid: async (_u: string, input: any, work: any) => { svc.__charged = input; await work(svc.prisma); } };
  Object.assign(svc, over);
  return svc;
}

const ctx = (o: Record<string, unknown> = {}) => ({ userId: 'u1', weeksKnown: 12, hour: 14, tz: 'Asia/Kolkata', ...o });

describe('she can actually talk', () => {
  it('a lonely sentence gets a conversation, not a deflection', async () => {
    const svc = bare();
    const t = await svc.ask('just feeling lonely', ctx());
    expect(t.text).toContain('What happened today?');
    expect(t.text).not.toMatch(/not something I can do yet/i);
  });

  it('nothing-matched becomes a conversation too — the owner’s screenshot lane', async () => {
    const svc = bare();
    const t = await svc.ask('tell me something interesting about octopuses', ctx());
    expect(t.text).toContain('What happened today?');
  });

  it('with no key she is exactly the phase-1 Mira, in both lanes', async () => {
    const svc = bare({ ai: { enabled: false, converse: async () => { throw new Error('must not be called'); } } });
    // "i am feeling low" is the LISTEN lane; "just feeling lonely" routes to
    // nothing-matched — the two sentences from the owner's screenshot, and
    // with the model off each falls back to its own phase-1 line.
    const listen = await svc.ask('i am feeling low', ctx());
    expect(listen.text).toBe("Yeah. What's going on?");
    const lonely = await svc.ask('just feeling lonely', ctx());
    expect(lonely.text).toMatch(/not something I can do yet/i);
    expect(svc.__upserts).toBeUndefined();
  });

  it('the transcript rides with the ask, and the current text is not sent twice', async () => {
    let seen: any[] = [];
    const svc = bare({ ai: { enabled: true, converse: async (_s: string, turns: any[]) => { seen = turns; return 'Yeah.'; } } });
    await svc.ask('just feeling lonely', ctx({
      history: [
        { who: 'me', text: 'i am feeling low' },
        { who: 'mira', text: "Yeah. What's going on?" },
        { who: 'me', text: 'just feeling lonely' },
      ],
    }));
    expect(seen.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(seen.filter((t) => t.content === 'just feeling lonely')).toHaveLength(1);
  });

  it('a reply that breaks her voice is dropped and the deterministic line stands', async () => {
    const svc = bare({ ai: { enabled: true, converse: async () => 'Great question! Happy to help.' } });
    const t = await svc.ask('i am feeling low', ctx());
    expect(t.text).toBe("Yeah. What's going on?");
    // And the dropped reply is not billed.
    expect(svc.__upserts).toBeUndefined();
  });
});

describe('the friend tab and the city tab', () => {
  it('"when will i find love" gets the friend, in friend mode', async () => {
    // The second question ever asked of her, and the assistant deflected it.
    // ADVISE routes to the model in friend mode — before foretold, after the
    // crisis hand-off.
    const svc = bare({ ai: { enabled: true, converse: async () => 'The chart says patience; I say your standards are finally working.' } });
    const t = await svc.ask('when will i find love', ctx({ mode: 'friend' }));
    expect(t.text).toContain('your standards');
  });

  it('with the model off, friend mode falls back to the assistant she was', async () => {
    const svc = bare({ ai: { enabled: false, converse: async () => { throw new Error('must not be called'); } } });
    const t = await svc.ask('when will i find love', ctx({ mode: 'friend' }));
    // foretold() answers deterministically — the phase-1 line, not a crash.
    expect(typeof t.text).toBe('string');
    expect(t.text.length).toBeGreaterThan(0);
  });

  it('a tab changes her register, never the crisis hand-off', async () => {
    const svc = bare({ ai: { enabled: true, converse: async () => { throw new Error('the hand-off outranks the model'); } } });
    const t = await svc.ask('my horoscope for today — he hits me and i am scared', ctx({ mode: 'friend' }));
    expect(typeof t.text).toBe('string');
  });
});

describe('the meter and the pass', () => {
  it('a model turn spends one of the two hundred, and says how many remain', async () => {
    const svc = bare();
    const t = await svc.ask('just feeling lonely', ctx());
    expect(svc.__upserts).toHaveLength(1);
    expect(svc.__upserts[0].update.chatUsed).toEqual({ increment: 1 });
    expect(t.pass).toEqual({ freeLeft: FREE_CHATS - 1 });
  });

  it(`turn ${FREE_CHATS + 1} is the paywall, and the model is never called`, async () => {
    const svc = bare({
      ai: { enabled: true, converse: async () => { throw new Error('the meter must answer first'); } },
      prisma: { miraPass: { findUnique: async () => ({ chatUsed: FREE_CHATS, paidUntil: null }) }, user: { findUnique: async () => null } },
    });
    const t = await svc.ask('just feeling lonely', ctx());
    expect(t.paywall).toBe(true);
    expect(t.text).toBe(PAYWALL_LINE);
    expect(t.text).toContain(`₹${SUB_INR}`);
  });

  it('a subscriber is not metered — freeLeft is null, never zero', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const svc = bare({
      prisma: {
        miraPass: { findUnique: async () => ({ chatUsed: 999, paidUntil: tomorrow }), upsert: async () => { throw new Error('a subscriber is not counted'); } },
        user: { findUnique: async () => ({ name: 'Somen' }) },
      },
    });
    const t = await svc.ask('just feeling lonely', ctx());
    expect(t.pass).toEqual({ freeLeft: null });
  });

  it('the deterministic lanes never touch the meter', async () => {
    const svc = bare({ ai: { enabled: false, converse: async () => null } });
    await svc.ask('take me to astrology', ctx());
    expect(svc.__upserts).toBeUndefined();
  });
});

describe('the subscription', () => {
  it('charges ₹999 through the unified rail and buys thirty days', async () => {
    const svc = bare();
    const before = Date.now();
    const r = await svc.subscribe('u1');
    expect(svc.__charged).toMatchObject({ hub: 'Mira', category: 'subscription', amountInr: SUB_INR });
    const days = (new Date(r.paidUntil).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect(r.freeLeft).toBeNull();
  });

  it('paying early stacks from the end of the current pass, never from today', async () => {
    const tenDaysOut = new Date(Date.now() + 10 * 86_400_000);
    const svc = bare({
      prisma: {
        miraPass: { findUnique: async () => ({ chatUsed: 0, paidUntil: tenDaysOut }), upsert: async () => undefined },
        user: { findUnique: async () => null },
      },
    });
    const r = await svc.subscribe('u1');
    const days = (new Date(r.paidUntil).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(39.5);
  });
});

describe('the persona is built from what is true', () => {
  const base = { mode: 'city' as const, weeksKnown: 12, distress: false, canDo: ['read your balance', 'find restaurants'] };

  it('carries their name, their clock, their chart — and the honesty about actions', () => {
    const p = persona({ ...base, name: 'Somen Kumar', clock: 'Friday 15 August, 1:05 am', signs: { sun: 'Leo', moon: 'Cancer', rising: 'Virgo' } });
    expect(p).toContain('Somen');
    expect(p).toContain('Friday 15 August');
    expect(p).toContain('Sun in Leo');
    expect(p).toContain('never a guarantee');
    expect(p).toContain('Never pretend an action happened');
  });

  it('a distressed turn strips every joke and points at people', () => {
    const p = persona({ ...base, distress: true });
    expect(p).toContain('Drop every joke');
    expect(p).toMatch(/professional/i);
    // The playful-by-default paragraph is REPLACED by the heavy one, not
    // stacked under it — two contradictory registers in one prompt is a coin
    // toss about which the model obeys.
    expect(p).not.toContain('playful by default');
  });

  it('the paywall line passes her own voice rules', () => {
    expect(violations(PAYWALL_LINE)).toEqual([]);
  });

  it('bans the generic-AI register by name', () => {
    const p = persona(base);
    expect(p).toContain('As an AI');
    expect(p).toContain('great question');
    expect(p).toContain('the universe is telling you');
  });

  it('the friend tab knows the numbers and refuses to invent a palm', () => {
    const p = persona({ ...base, mode: 'friend', lifePath: 7, signs: { sun: 'Leo' } });
    expect(p).toContain('FRIEND TAB');
    expect(p).toContain('life path is 7');
    expect(p).toContain('Never invent what you have not been shown');
    // The city-tab page paragraph does not leak into the friend tab.
    expect(p).not.toContain('standing on');
  });

  it('the city tab carries the page they came from, and its honesty', () => {
    const p = persona({ ...base, page: '/nutrition/plan' });
    expect(p).toContain('/nutrition/plan');
    expect(p).toContain('cannot fill forms for them yet');
    expect(p).not.toContain('FRIEND TAB');
  });

  it('the life path reduces like every school of numerology', () => {
    expect(lifePathOf('1988-08-08')).toBe(6);   // 42 → 6
    expect(lifePathOf('1991-05-04')).toBe(11);  // 29 → 11, a master number, kept
    expect(lifePathOf(null)).toBeNull();
    expect(lifePathOf('19')).toBeNull();
  });
});
