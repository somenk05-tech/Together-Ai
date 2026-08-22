import { MiraService } from './mira.service';
import { persona, lifePathOf, FREE_CHATS, SUB_INR, PAYWALL_LINE } from './persona';
import { manifest } from './manifest';
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
    // The price and the free total ride with the meter now: the web app typed
    // ₹999 at three call sites with nothing checking any of them.
    expect(t.pass).toEqual({ freeLeft: FREE_CHATS - 1, inr: SUB_INR, freeTotal: FREE_CHATS });
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
    expect(t.pass).toEqual({ freeLeft: null, inr: SUB_INR, freeTotal: FREE_CHATS });
  });

  it('the deterministic lanes never touch the meter', async () => {
    const svc = bare({ ai: { enabled: false, converse: async () => null } });
    await svc.ask('take me to astrology', ctx());
    expect(svc.__upserts).toBeUndefined();
  });

  /** The pass row now holds the distress latch as well as the meter, and a
   *  latch being written is not a conversation being billed. */
  it('a distressed turn latches without spending anything', async () => {
    const svc = bare({ ai: { enabled: false, converse: async () => null } });
    await svc.ask("i feel awful, my dad's in hospital", ctx());
    expect(svc.__upserts).toHaveLength(1);
    expect(svc.__upserts[0].update.chatUsed).toBeUndefined();
    expect(svc.__upserts[0].update.distressUntil).toBeInstanceOf(Date);
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
  const base = { mode: 'city' as const, weeksKnown: 12, distress: false, canDo: ['read your balance', 'find a recipe'] };

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


/**
 * ── THE ASSERTION THE WHOLE LANDING EXISTS FOR ────────────────────────────
 *
 * `crisis.spec.ts` proves the LEXICON: that these sentences are recognised.
 * This proves the WIRING: that in both of her rooms, with the model configured
 * and with it switched off, the sentence reaches the hand-off and nothing else
 * — no capability, no navigation, no model, and no joke.
 *
 * It is a sweep rather than three cases because the failure it guards against
 * has never been "the lexicon missed it". It has always been a new branch,
 * added for a good reason, that returns before the check: the friend tab was
 * one, the model lane was one, and the low-confidence capability path added in
 * this landing is a third.
 */
describe('the crisis hand-off is wired, in both rooms, with the model on and off', () => {
  const CRISIS = ['i want to kill myself', 'i want to die', "i don't want to be here"];
  const ROOMS = ['friend', 'city'] as const;

  for (const ask of CRISIS) {
    for (const mode of ROOMS) {
      for (const model of [true, false]) {
        it(`${JSON.stringify(ask)} · ${mode} tab · model ${model ? 'on' : 'off'}`, async () => {
          const svc = bare({
            ai: {
              enabled: model,
              // A crisis is answered by code that cannot have a bad day. If the
              // model is reached at all on this turn, this test has failed.
              converse: async () => { throw new Error('the hand-off outranks the model'); },
            },
          });
          const t = await svc.ask(ask, ctx({ mode }));
          expect(t.text).toContain('14416');
          expect(t.text).toContain('112');
          expect(t.levity).toBe(0);
          // No navigation offered, and nobody billed for being at the edge.
          expect(t.goto).toBeUndefined();
          expect(svc.__upserts?.some((u: any) => u.update?.chatUsed)).toBeFalsy();
        });
      }
    }
  }
});

/**
 * F1 — THE FRIEND TAB IS NOT THE ASSISTANT WITH THREE IFS IN IT.
 *
 * `route()` scores against the manifest in both rooms and returns a capability
 * at 0.55 with no idea which room asked. The capability below is a stand-in
 * with one utterance, and the sentence matches its tokens without matching it
 * outright — enough to answer in the city room, nowhere near enough to
 * interrupt a conversation in the friend room.
 */
describe('a sentence in the friend room is not a database query', () => {
  const CAP = {
    id: 'demo GET plan', controller: 'demo.controller.ts', method: 'GET', path: 'demo/plan',
    intent: 'read your demo plan', risk: 'R0' as const, utterances: ['my fitness plan'],
  };
  const withCap = (over: Record<string, any> = {}) => bare({
    registry: { upTo: () => [CAP], byId: () => CAP, all: () => [CAP] },
    ai: { enabled: true, converse: async () => 'That sounds like a lot to carry this week.' },
    ...over,
  });
  const MIDDLING = 'my fitness has been a plan for later';

  it('the city room answers a middling match with the data', async () => {
    const t = await withCap().ask(MIDDLING, ctx({ mode: 'city' }));
    expect(t.confidence).toBeGreaterThanOrEqual(0.55);
    expect(t.confidence).toBeLessThan(0.8);
    expect(t.text).not.toContain('to carry this week');
  });

  it('the friend room talks instead', async () => {
    const t = await withCap().ask(MIDDLING, ctx({ mode: 'friend' }));
    expect(t.text).toContain('to carry this week');
  });

  /** With no key she is the phase-1 assistant in both rooms — degradation, not
   *  an error. That equivalence is what keeps every older spec here true. */
  it('and with the model off the friend room falls back to the capability', async () => {
    const t = await withCap({ ai: { enabled: false, converse: async () => null } })
      .ask(MIDDLING, ctx({ mode: 'friend' }));
    expect(t.capabilityId).toBe('demo GET plan');
  });
});

/**
 * F9 — ONE BANNED PHRASE USED TO COST THE WHOLE REPLY.
 *
 * A four-sentence answer that happened to contain "of course!" was thrown away
 * and replaced with "Yeah. What's going on?". She asks again now, naming the
 * phrase — once, because this is a paid call and the meter is real.
 */
describe('a reply that breaks her voice gets one more go', () => {
  it('names the offending phrase back and keeps the second answer', async () => {
    const replies = ['Of course! Lonely evenings are the worst.', 'Lonely evenings are the worst kind of quiet.'];
    let calls = 0;
    let secondPrompt = '';
    const svc = bare({
      ai: {
        enabled: true,
        converse: async (system: string) => {
          calls += 1;
          if (calls === 2) secondPrompt = system;
          return replies[calls - 1] ?? null;
        },
      },
    });
    const t = await svc.ask('i am feeling low', ctx());
    expect(calls).toBe(2);
    expect(secondPrompt).toContain('Of course!');
    expect(t.text).toBe('Lonely evenings are the worst kind of quiet.');
    // One conversation, not two: the retry is her problem, not the citizen's.
    expect(svc.__upserts).toHaveLength(1);
  });

  it('and stops at one — the deterministic line stands, unbilled', async () => {
    let calls = 0;
    const svc = bare({ ai: { enabled: true, converse: async () => { calls += 1; return 'Great question! Happy to help.'; } } });
    const t = await svc.ask('i am feeling low', ctx());
    expect(calls).toBe(2);
    expect(t.text).toBe("Yeah. What's going on?");
    expect(svc.__upserts).toBeUndefined();
  });
});

describe('and the persona is built from the account, not the request', () => {
  /**
   * C3 — SHE WOULD DENY FOUR THINGS SHE COULD DO.
   *
   * The list was rendered `canDo.slice(0, 24)` under the sentence "you can
   * actually do these, and only these, today", and the registry holds more
   * than twenty-four. A cap on a list whose length is decided in another file
   * goes wrong the day somebody adds a decorator, silently, in the direction
   * of her being less honest.
   */
  it('renders every capability in the registry, not the first two dozen', () => {
    const canDo = manifest().map((c) => c.intent.toLowerCase());
    expect(canDo.length).toBeGreaterThan(24);
    const p = persona({ mode: 'city', weeksKnown: 12, distress: false, canDo });
    for (const intent of canDo) expect(p).toContain(intent);
  });

  /** `weeksKnown` came off the browser, where it was editable and reset on a
   *  refresh. It comes off `MiraPass.firstSeenAt` now, and the request's claim
   *  is ignored. */
  it('counts the weeks from the pass row, not from the tab', async () => {
    let system = '';
    const met = (firstSeenAt: Date) => bare({
      ai: { enabled: true, converse: async (s: string) => { system = s; return 'Yeah.'; } },
      prisma: {
        miraPass: { findUnique: async () => ({ chatUsed: 0, paidUntil: null, firstSeenAt, greetings: [] }), upsert: async () => undefined },
        user: { findUnique: async () => null },
      },
    });
    await met(new Date()).ask('just feeling lonely', ctx({ weeksKnown: 99 }));
    expect(system).toContain('You met recently');
    await met(new Date(Date.now() - 40 * 86_400_000)).ask('just feeling lonely', ctx({ weeksKnown: 0 }));
    expect(system).not.toContain('You met recently');
  });
});
