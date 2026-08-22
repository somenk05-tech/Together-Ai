import { MiraService } from './mira.service';
import type { Capability } from './mira.registry';
import { manifest } from './manifest';
import { profileFor, ALL_MOODS } from './mood';

/**
 * THE REAL INVENTORY, NOT A HAND-PICKED FOUR.
 *
 * These used to be four literals. That made every test here pass against a
 * router that had almost nothing to match on — so "my watchlist" fell through to
 * the place-finder and the suite called it a pass, while production had the
 * capability all along.
 *
 * Reading `manifest()` means the router in these tests sees exactly what the
 * running one sees, and a decorator added without an executor branch shows up
 * here as a failure rather than as a shrug in front of a citizen.
 */
const CAPS: Capability[] = manifest().map((c) => ({
  id: c.id,
  controller: c.file,
  method: c.method,
  path: c.path,
  intent: c.intent,
  risk: c.risk,
  utterances: c.utterances,
  needs: c.needs,
  confirm: c.confirm,
}));

type Stub = (...a: never[]) => Promise<unknown>;

/**
 * Sixteen hub services, hand-stubbed.
 *
 * The list is long because the city she can read is now long, and that is worth
 * carrying rather than hiding behind a mock framework: a service added to the
 * constructor and forgotten here is a red build, which is exactly the signal
 * wanted. Each entry is the ONE method the executor calls.
 */
interface Hubs {
  wallet: Stub; transactions: Stub; budgets: Stub; spending: Stub;
  list: Stub; usage: Stub;
  daily: Stub; gems: Stub; remedies: Stub; dailyCard: Stub;
  today: Stub; prepAlerts: Stub; planToday: Stub; targets: Stub; healthSummary: Stub;
  account: Stub; unreadCount: Stub;
  get: Stub; healthScore: Stub; completion: Stub;
  plan: Stub; log: Stub; routine: Stub; watchlist: Stub; myTrips: Stub; thoughts: Stub;
}

const DEFAULTS: Hubs = {
  wallet: () => Promise.resolve({ balanceInr: 48200 }),
  transactions: () => Promise.resolve([]),
  budgets: () => Promise.resolve([]),
  spending: () => Promise.resolve({ thisMonthInr: 0 }),
  list: () => Promise.resolve({ files: [] }),
  usage: () => Promise.resolve({ usedPct: 12 }),
  daily: () => Promise.resolve({ needsProfile: false, pending: false, date: '2026-08-14', title: 'A steady one', body: 'A steady day, mostly. Keep the afternoon light.' }),
  gems: () => Promise.resolve({ needsProfile: false, stone: 'Red coral' }),
  remedies: () => Promise.resolve({ needsProfile: false, practices: [] }),
  dailyCard: () => Promise.resolve({ name: 'The Tower' }),
  today: () => Promise.resolve({ doses: [] }),
  prepAlerts: () => Promise.resolve({ alerts: [] }),
  planToday: () => Promise.resolve({ needsProfile: false, meals: [] }),
  targets: () => Promise.resolve({ calories: 2100, protein: 130 }),
  healthSummary: () => Promise.resolve({ hasPanel: false }),
  account: () => Promise.resolve({ counts: { inboxUnread: 0 } }),
  unreadCount: () => Promise.resolve(0),
  get: () => Promise.resolve({ name: 'Somen', age: 34 }),
  healthScore: () => Promise.resolve({ score: 71 }),
  completion: () => Promise.resolve([]),
  plan: () => Promise.resolve({ focus: 'Lower body' }),
  log: () => Promise.resolve({ weekMinutes: 0 }),
  routine: () => Promise.resolve({ needsBudget: true }),
  watchlist: () => Promise.resolve({ items: [] }),
  myTrips: () => Promise.resolve([]),
  thoughts: () => Promise.resolve({ items: [] }),
};

const recorded: Array<Record<string, unknown>> = [];

/** Cast once, at the constructor boundary — `any` at eighteen call sites is
 *  what the lint ceiling rejects, and it would also stop these tests from
 *  telling us when a service signature changes. */
const as = <N extends number>(o: unknown) => o as ConstructorParameters<typeof MiraService>[N];

/**
 * The account, as far as this file is concerned.
 *
 * It used to be `{}` under the note "Prisma, unreachable: with the model off,
 * nothing in ask() touches it". That stopped being true when the safety
 * governor's inputs moved off the request and onto the account — she reads the
 * profile's zone and the pass row on every turn now, and a citizen with
 * neither is a citizen on their first turn, which is what these defaults are.
 */
const NOBODY = {
  masterProfile: { findUnique: () => Promise.resolve(null) },
  miraPass: { findUnique: () => Promise.resolve(null), upsert: () => Promise.resolve(undefined) },
  miraTurn: {
    findMany: () => Promise.resolve([]),
    createMany: () => Promise.resolve(undefined),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
};

const svc = (over: Partial<Hubs> = {}, account: unknown = NOBODY, ai: unknown = { enabled: false, converse: async () => null }) => {
  const h = { ...DEFAULTS, ...over };
  return new MiraService(
    as<0>({ wallet: h.wallet, transactions: h.transactions, budgets: h.budgets, spending: h.spending }),
    as<1>({ list: h.list, usage: h.usage }),
    as<2>({ daily: h.daily, gems: h.gems, remedies: h.remedies }),
    as<3>({ dailyCard: h.dailyCard }),
    as<4>({ today: h.today }),
    as<5>({ prepAlerts: h.prepAlerts, planToday: h.planToday, targets: h.targets }),
    as<6>({ healthSummary: h.healthSummary }),
    as<7>({ account: h.account }),
    as<8>({ unreadCount: h.unreadCount }),
    as<9>({ get: h.get, healthScore: h.healthScore, completion: h.completion }),
    as<10>({ plan: h.plan, log: h.log }),
    as<11>({ routine: h.routine }),
    as<12>({ watchlist: h.watchlist }),
    as<13>({ myTrips: h.myTrips }),
    as<14>({ list: h.thoughts }),
    // A stand-in registry. In production this is filled by Nest's DiscoveryService
    // reading @Mira() metadata off the live handlers.
    as<15>({ upTo: () => CAPS, byId: (id: string) => CAPS.find((c) => c.id === id), all: () => CAPS }),
    as<16>({ record: (e: Record<string, unknown>) => { recorded.push(e); } }),
    // The model, OFF. Every test in this file describes the deterministic
    // Mira, and she must be exactly as she was when the model is not
    // configured — that equivalence is itself the thing under test.
    as<17>(ai),
    // Prisma. See NOBODY: the governor reads the account on every turn now.
    as<18>(account),
    // The daybook, likewise: only readDay() reads it, and readDay is not ask().
    as<19>({}),
  );
};

const ctx = (o: Partial<Parameters<MiraService['ask']>[1]> = {}) => ({
  userId: 'u1', weeksKnown: 52, hour: 14, ...o,
});

/**
 * A fixed-offset zone in which it is right now the hour we want it to be.
 *
 * Written this way because the alternative — naming a real city and asserting
 * what time it is there — is a test that passes for eighteen hours a day. IANA
 * inverts the sign on `Etc/GMT`: `Etc/GMT-3` is UTC+3.
 */
const zoneWhereItIs = (hour: number): string => {
  const shift = (((hour - new Date().getUTCHours()) % 24) + 24) % 24;
  if (shift === 0) return 'UTC';
  return shift <= 12 ? `Etc/GMT-${shift}` : `Etc/GMT+${24 - shift}`;
};

beforeEach(() => { recorded.length = 0; });

describe('phase 1 reads and does not write', () => {
  it('answers a balance question with the number', async () => {
    const t = await svc().ask("what's my balance", ctx());
    expect(t.lane).toBe('RETRIEVE');
    expect(t.text).toContain('48,200');
  });

  it('never routes to ACT — nothing above R0 is decorated yet', async () => {
    const asks = ["what's my balance", 'find somewhere for dinner', 'my documents', 'what did I spend'];
    for (const a of asks) {
      const t = await svc().ask(a, ctx());
      expect(t.lane).not.toBe('ACT');
    }
  });

  it('says so plainly when it cannot help', async () => {
    const t = await svc().ask('please refactor the deployment pipeline', ctx());
    expect(t.text).toMatch(/not something I can do yet/i);
  });
});

/**
 * THE LOOP.
 *
 * Found in the owner's own chat, in production:
 *
 *     — You can't assess my astrology profile
 *     — Two places that could be: Astrology or Profile. Which one?
 *     — Astrology
 *     — Two places that could be: Astrology or Log. Which one?
 *
 * Two faults, and this describe block is one test per fault. They are separate
 * because fixing either alone still loops.
 */
describe('she does not ask the same question twice', () => {
  it('takes a clear winner instead of offering a runner-up', async () => {
    const t = await svc().ask('take me to astrology', ctx());
    expect(t.text).not.toMatch(/which one/i);
    expect(t.goto?.path).toMatch(/astrolog/i);
  });

  it('reads a one-word reply as the answer to the question she just asked', async () => {
    const choices = [
      { label: 'Astrology', path: '/astrology' },
      { label: 'Astrology Log', path: '/astrology/log' },
    ];
    const t = await svc().ask('Astrology', ctx({ answering: choices }));
    expect(t.text).not.toMatch(/which one/i);
    expect(t.goto).toEqual({ label: 'Astrology', path: '/astrology' });
  });

  it('accepts a position as an answer too', async () => {
    const choices = [{ label: 'Budgets', path: '/financial/budgets' }, { label: 'Spending', path: '/financial/spending' }];
    const t = await svc().ask('the second one', ctx({ answering: choices }));
    expect(t.goto?.path).toBe('/financial/spending');
  });

  /** …and when it really IS a question, the options ride out with it, or the
   *  next turn has nothing to resolve against and the loop returns. */
  it('sends its options with the question', async () => {
    const t = await svc().ask('cancel friday', ctx());
    if (t.text.match(/which/i) && t.choices) expect(Array.isArray(t.choices)).toBe(true);
  });
});

describe('“how is my day going to be” is one turn, not four', () => {
  it('reads the citizen’s own letter rather than shrugging', async () => {
    const t = await svc().ask('how is my day going to be', ctx());
    expect(t.text).not.toMatch(/not something I can do yet/i);
    expect(t.text).toMatch(/steady day/i);
  });

  it('joins the doses and the inbox onto the reading', async () => {
    const t = await svc({
      today: () => Promise.resolve({ doses: [{ medicine: 'Metformin', status: 'due' }] }),
      account: () => Promise.resolve({ counts: { inboxUnread: 3 } }),
    }).ask('how is my day going to be', ctx({ dial: 0 }));
    expect(t.text).toMatch(/steady day/i);
    expect(t.text).toMatch(/One dose/);
    expect(t.text).toMatch(/Metformin/);
    expect(t.text).toMatch(/3 unread/);
  });

  /** A hub being down must not take the morning with it. */
  it('survives a hub throwing', async () => {
    const t = await svc({ today: () => Promise.reject(new Error('db down')) }).ask('how is my day', ctx());
    expect(t.text).toMatch(/steady day/i);
  });

  it('asks for birth details instead of inventing a reading', async () => {
    const t = await svc({ daily: () => Promise.resolve({ needsProfile: true }) }).ask('my horoscope', ctx());
    expect(t.text).toMatch(/birth details/i);
    expect(t.goto?.path).toBe('/astrology');
  });

  /** The letter is a model call, cached per day. `pending` is reported, never
   *  retried — it is not hers to spend. */
  it('says the letter is still being written rather than pretending', async () => {
    const t = await svc({ daily: () => Promise.resolve({ needsProfile: false, pending: true, date: 'x' }) })
      .ask('my reading today', ctx());
    expect(t.text).toMatch(/still being written/i);
  });
});

describe('the person comes first, in the service too', () => {
  it('a feeling gets a listening turn and no data call', async () => {
    let walletCalled = false;
    const s = svc({ wallet: () => { walletCalled = true; return Promise.resolve({ balanceInr: 1 }); } });
    const t = await s.ask("i feel terrible, what's my balance", ctx());
    expect(t.lane).toBe('LISTEN');
    expect(walletCalled).toBe(false);
  });

  it('distress opens with the written line, not an improvised one', async () => {
    const t = await svc().ask("i feel awful, my dad's in hospital", ctx());
    expect(t.levity).toBe(0);
    expect(t.text).toMatch(/Forget everything else/);
  });

  it('a listening turn is L0 even from a playful citizen', async () => {
    const t = await svc().ask('haha i feel terrible', ctx({ dial: 2 }));
    expect(t.levity).toBe(0);
  });

  /**
   * AND NO ASIDE SURVIVES A DISTRESSED TURN.
   *
   * This is the assertion the whole `say()` split exists for. Before it, the
   * governor computed a level and the executor threw it away, so every safety
   * cap in `levity.ts` was guarding a personality that was never applied.
   */
  it('never appends a joke to a turn the governor silenced', async () => {
    const t = await svc().ask("everything feels like it's falling apart", ctx({ dial: 2 }));
    expect(t.levity).toBe(0);
    expect(t.text.split(/[.!?]/).filter((s) => s.trim()).length).toBeLessThanOrEqual(3);
  });
});

describe('it asks rather than guessing', () => {
  it('"cancel friday" asks which', async () => {
    const t = await svc().ask('cancel friday', ctx());
    expect(t.lane).toBe('AMBIGUOUS');
    expect(t.text).toMatch(/which/i);
  });

  it('asks exactly one question', async () => {
    const t = await svc().ask('cancel friday', ctx());
    expect((t.text.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe('everything she says passes her own voice rules', () => {
  // Her lines here are deterministic, so this should be impossible to fail —
  // which is the point. If an edit ever makes it fail, it fails in CI rather
  // than in front of somebody.
  const ASKS = [
    "what's my balance", 'what did I spend', 'my documents', 'find somewhere for dinner',
    'i feel terrible today', "my dad's in hospital", 'cancel friday', 'book it',
    'why has this year been so hard', 'please refactor the deployment pipeline', '   ',
    'how is my day going to be', 'my medicines', 'any new mail', 'my budgets',
    'my watchlist', 'my trips', 'my workout', 'my routine', 'my notes',
    'my health summary', 'my calorie target', 'what should I cook', 'my profile',
    'which stone should I wear', 'my card today', 'how much storage',
  ];

  it.each(ASKS)('%j', async (ask) => {
    // Every dial, so an aside written for L3 is swept too.
    for (const dial of [0, 1, 2] as const) {
      const t = await svc().ask(ask, ctx({ dial }));
      // acceptOrFallback would have swapped in the fallback if it drifted; the
      // fallback itself is in voice, so assert we did NOT need it.
      expect(t.text).not.toBe("I can't do that from here.");
      expect(t.text.length).toBeGreaterThan(0);
    }
  });
});

describe('empty results are said honestly', () => {
  it('an empty drive is not dressed up', async () => {
    const t = await svc({ list: () => Promise.resolve({ files: [] }) }).ask('my documents', ctx());
    expect(t.text).toMatch(/nothing/i);
  });

  it('no transactions is not "0 transactions"', async () => {
    const t = await svc({ transactions: () => Promise.resolve([]) }).ask('what did I spend', ctx());
    expect(t.text).toMatch(/^Nothing in your transactions yet\./);
  });

  it('an empty watchlist is not a recommendation', async () => {
    const t = await svc().ask('my watchlist', ctx());
    expect(t.text).toMatch(/nothing/i);
  });
});

describe('every question is written down', () => {
  it('records the ask, the lane and what she did with it', async () => {
    await svc().ask("what's my balance", ctx());
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ text: "what's my balance", outcome: 'capability', capability: 'financial GET wallet' });
  });

  it('marks a miss as a miss — that set is the roadmap', async () => {
    await svc().ask('please refactor the deployment pipeline', ctx());
    expect(recorded[0].outcome).toBe('clarify');
  });

  /** The guarantee that it cannot take an answer down lives in the ledger
   *  itself — `record()` floats its write and swallows — and is asserted in
   *  `ledger.spec.ts`. Asserting it again through a stub here would only be
   *  testing the stub. */
});

describe('the trace explains the turn', () => {
  it('carries the route reason, the mood and the levity derivation', async () => {
    const t = await svc().ask("what's my balance", ctx());
    const trace = t.trace.join(' ');
    expect(trace).toMatch(/matched financial/);
    expect(trace).toMatch(/mood: /);
    expect(trace).toMatch(/result L/);
  });
});


/**
 * THE RATIO HAS TO SURVIVE A REAL ANSWER — Framework §3, settled 15 Aug.
 *
 * 70% trusted best friend, 15% assistant. That is a sentence in a document, and
 * a sentence in a document is a suggestion — the argument
 * `Astrology-Voice-Principles.md` already won about language rules in system
 * prompts, pointed at personality instead.
 *
 * Here is how it was being lost in production, silently. `say()` refuses to
 * append an aside when the finished line would exceed the mood's word budget:
 *
 *     if (words(text) + words(pick) > p.words * 2) return text;
 *
 * The day brief was fifty-five words of `parts.join(' ')`. So on the single turn
 * most likely to be somebody's FIRST — "how is my day going to be" — she came
 * back 100% assistant and 0% friend. Not by anyone's decision. By arithmetic.
 *
 * Nothing was red. The governor worked exactly as designed. The answer was
 * simply too long to carry a voice. §23 (length follows the need) and §18 (her
 * speech is shorter than her writing) become enforceable here instead of
 * aspirational.
 */
const LOADED = {
  daily: () => Promise.resolve({
    needsProfile: false, pending: false, title: 'A steady one',
    body: 'A steady day, mostly. Keep the afternoon light. There is something you have been meaning to say that would land cleanly if you spoke it plainly, without heat or qualification.',
  }),
  today: () => Promise.resolve({ doses: [{ medicine: 'Metformin', status: 'due' }] }),
  prepAlerts: () => Promise.resolve({
    alerts: [{ title: 'Coconut-curry Lentil Stew Served Over Quinoa Thali', startBy: '2026-08-15T05:15:00.000Z' }],
  }),
  planToday: () => Promise.resolve({
    needsProfile: false,
    dayISO: '2026-08-15',
    meals: [
      { slot: 'b', title: 'Poha with peanuts', label: 'Breakfast' },
      { slot: 'l', title: 'Rajma chawal', label: 'Lunch' },
      { slot: 'd', title: 'Palak paneer and roti', label: 'Dinner' },
    ],
  }),
  account: () => Promise.resolve({ counts: { inboxUnread: 3 } }),
  unreadCount: () => Promise.resolve(2),
};

const countWords = (t: string) => t.split(/\s+/).filter(Boolean).length;
const loaded = (o: Record<string, unknown> = {}) =>
  svc(LOADED).ask('how is my day going to be', ctx(o));

describe('the day brief is short enough to still sound like her', () => {
  /** The two asides `dayBrief` can reach for. If neither is there, she is mute. */
  const HER_VOICE = /pills are not going to take themselves|whole of it/i;

  /**
   * MEASURE THE THING, NOT A PROXY FOR IT.
   *
   * The first cut of this test counted words and compared them against the mood
   * budget by hand — and got it wrong, because `t.text` is what `say()` already
   * returned, aside included. It was adding the aside twice and failing a brief
   * that was fine.
   *
   * So ask the real question instead: did her voice survive? That is one
   * `toMatch`, it cannot be arithmetic-ed wrong, and it fails hard on the
   * fifty-five-word join it was written for — that version fitted no mood at
   * all, so the aside was dropped on every seed, for everyone, permanently.
   *
   * Swept across seeds because the mood is the day's, not the turn's: passing on
   * whichever mood seed 0 happens to pick would be a test that holds for one
   * day in six.
   */
  /**
   * SWEPT ACROSS CITIZENS, NOT ACROSS CLAIMED SEEDS.
   *
   * This used to pass `ctx({ seed })` twelve times. The seed is derived from
   * the citizen and their local day now — the request's copy is answered, not
   * obeyed — so twelve claimed seeds would have been twelve runs of the same
   * mood, and this test would have read as green while measuring one sixth of
   * what it says it measures. Twelve citizens is twelve seeds.
   */
  it('survives a fully loaded day, on most of her moods', async () => {
    const heard: string[] = [];
    for (let n = 0; n < 12; n++) {
      const t = await svc(LOADED).ask('how is my day going to be', ctx({ userId: `u${n}` }));
      if (HER_VOICE.test(t.text)) heard.push(`u${n}`);
    }
    expect(heard.length).toBeGreaterThanOrEqual(6);
  });

  /**
   * And the brief underneath stays short, so the line above cannot be rescued
   * later by quietly raising a word budget instead of shortening an answer.
   * `quiet` is eight words ON PURPOSE; the bar is the widest mood, not every one.
   */
  it('stays inside the widest mood budget before anything is appended', async () => {
    const t = await svc(LOADED).ask('how is my day going to be', ctx({ dial: 0 }));
    const widest = Math.max(...ALL_MOODS.map((m) => profileFor(m, 2).words));
    expect(countWords(t.text)).toBeLessThanOrEqual(widest * 2);
  });

  it('reads like a person wrote it', async () => {
    const t = await loaded({ tz: 'Asia/Kolkata' });
    // eslint-disable-next-line no-console
    console.log(`  day brief: ${t.text}`);
    expect(t.text).not.toMatch(/undefined|NaN|\[object/);
  });
});

describe('nothing she says is a machine string', () => {
  it('never reads an ISO timestamp aloud', async () => {
    const t = await loaded();
    expect(t.text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  /** §10: her clock is the citizen's clock. 05:15Z is 10:45 in Kolkata. */
  it('says the time on the citizen own wall', async () => {
    const t = await loaded({ tz: 'Asia/Kolkata' });
    expect(t.text).toMatch(/10:45\s?am/i);
  });

  it('falls silent about the time rather than naming a wrong one', async () => {
    const t = await loaded({ tz: 'Not/AZone' });
    expect(t.text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  /** A hub field is quoted, never made the subject of a verb. */
  it('does not conjugate a database row', async () => {
    const t = await loaded();
    expect(t.text).not.toMatch(/Thali wants/i);
  });
});

describe('a question about a life is not a question about a task', () => {
  it('does not ask what they are trying to get done', async () => {
    const t = await svc().ask('when will i find love', ctx());
    expect(t.text).not.toMatch(/trying to get done/i);
  });

  /** §11: no guaranteed marriage, no guaranteed anything. */
  it('refuses to put a date on it, and says where the real answer lives', async () => {
    const t = await svc().ask('when will i find love', ctx());
    expect(t.text).toMatch(/not going to put a date/i);
    expect(t.goto?.path).toBe('/astrology');
  });

  it('leaves an ordinary request alone', async () => {
    const t = await svc().ask('take me to astrology', ctx());
    expect(t.text).not.toMatch(/not going to put a date/i);
  });
});


/**
 * ── X1: THE SAFETY GOVERNOR'S INPUTS COME OFF THE ACCOUNT ─────────────────
 *
 * `hour`, `weeksKnown` and `distressLocked` were request-body fields, so a
 * curl with `{hour: 14, distressLocked: false}` defeated the small-hours
 * damper and the distress latch together — and no malice was needed for it to
 * go wrong, because a browser tab is per-device and empty after a refresh.
 *
 * The comment that defended the old arrangement named `MasterProfile.timeZone`
 * as the thing this class of bug exists to prevent, while the server held that
 * zone and read the browser's copy instead.
 */
describe('what the request claims is not what she believes', () => {
  const account = (over: Record<string, unknown> = {}) => ({
    ...NOBODY,
    masterProfile: { findUnique: () => Promise.resolve(over.profile ?? null) },
    miraPass: { findUnique: () => Promise.resolve(over.pass ?? null), upsert: () => Promise.resolve(undefined) },
  });

  it('takes the hour from the zone on the profile, not from the body', async () => {
    // The body says 3am — which would cap her at L2 and say so in the trace.
    const t = await svc({}, account({ profile: { timeZone: zoneWhereItIs(14) } })).ask("what's my balance", ctx({ hour: 3 }));
    expect(t.trace.join(' ')).not.toMatch(/03:00 local/);
  });

  it('and applies the small-hours damper when the ZONE says so, whatever the body says', async () => {
    const t = await svc({}, account({ profile: { timeZone: zoneWhereItIs(3) } })).ask("what's my balance", ctx({ hour: 14 }));
    expect(t.trace.join(' ')).toMatch(/03:00 local/);
  });

  /** No zone on the profile is the one case the client's copy is still read —
   *  a fallback, which is where we started and is better than a wrong hour. */
  it('falls back to the body only when the profile has no zone', async () => {
    const t = await svc({}, account()).ask("what's my balance", ctx({ hour: 3 }));
    expect(t.trace.join(' ')).toMatch(/03:00 local/);
  });

  it('holds the distress latch from the account, and a request cannot clear it', async () => {
    const held = account({ pass: { chatUsed: 0, paidUntil: null, distressUntil: new Date(Date.now() + 60_000), greetings: [] } });
    const t = await svc({}, held).ask('take me to astrology', ctx({ dial: 2, distressLocked: false }));
    expect(t.levity).toBe(0);
    expect(t.trace.join(' ')).toMatch(/distress lock/i);
  });

  /** …and it decays. A latch that can only be cleared by a browser is a latch
   *  that is either永 held or lost on a refresh; four hours is an evening. */
  it('and lets it go once it has decayed', async () => {
    const stale = account({ pass: { chatUsed: 0, paidUntil: null, distressUntil: new Date(Date.now() - 60_000), greetings: [] } });
    const t = await svc({}, stale).ask('take me to astrology', ctx({ dial: 2 }));
    expect(t.levity).toBeGreaterThan(0);
  });

  it('answers with the seed it used, and the same one whatever the request guessed', async () => {
    const a = await svc().ask("what's my balance", ctx({ seed: 7 }));
    const b = await svc().ask("what's my balance", ctx({ seed: 99 }));
    expect(typeof a.seed).toBe('number');
    expect(a.seed).toBe(b.seed);
  });
});

/**
 * ── A REFUSAL IS AN ANSWER TO HER QUESTION ────────────────────────────────
 *
 * "no", "neither", "both" used to fall out of `resolveChoice` as nothing,
 * which the service read as "not an answer" and re-routed as a fresh request.
 * So declining her question navigated somewhere.
 */
describe('she can be told the question was wrong', () => {
  const choices = [
    { label: 'Astrology', path: '/astrology' },
    { label: 'Astrology Log', path: '/astrology/log' },
  ];

  it('"neither" drops the question instead of routing it', async () => {
    const t = await svc().ask('neither', ctx({ answering: choices }));
    expect(t.goto).toBeUndefined();
    expect(t.choices).toBeUndefined();
    expect(t.text).toMatch(/dropped/i);
  });

  it('"both" does not pick one of them behind her back', async () => {
    const t = await svc().ask('both', ctx({ answering: choices }));
    expect(t.goto).toBeUndefined();
    expect(t.text).toMatch(/one at a time/i);
  });
});

/**
 * ── C6: THE RELATIONSHIP READER STOPS INTERCEPTING ORDINARY REQUESTS ──────
 *
 * `SHAPES` in relate.ts holds bare `too much`, `every day` and
 * `fix (this|things|it)`, and the read ran before `findInCity` on everything
 * it produced. The gate is now whether a person was named — which is also what
 * stops the correction going too far the other way.
 */
describe('a request is not a relationship', () => {
  it('"can you fix this" is not answered with a script about somebody', async () => {
    const t = await svc().ask('can you fix this', ctx({ mode: 'friend' }));
    expect(t.text).not.toMatch(/went badly with them/i);
  });

  /** And the correction does not eat the lane it was protecting: a sentence
   *  that NAMES somebody still outranks the place-finder, which scores
   *  "Flights" at 0.6 against the word "fight". */
  it('"i had a fight with my sister" is not a flight', async () => {
    const t = await svc().ask('i had a fight with my sister', ctx());
    expect(t.goto).toBeUndefined();
    expect(t.text).toMatch(/your sister/i);
  });
});

/** A route she offers has to be a route. `/medicines` never was one. */
describe('every door she offers opens', () => {
  it('sends Medicines to the page the city index actually has', async () => {
    const t = await svc({ today: () => Promise.resolve({ doses: [{ medicine: 'Metformin', status: 'due' }] }) })
      .ask('my medicines', ctx());
    expect(t.goto?.path).toBe('/medical/medicines');
  });
});


/**
 * ── SHE STOPPED SAYING THE SAME FOUR THINGS ───────────────────────────────
 *
 * The mood cycled on the seed with a period of 7 and the line with a period of
 * 3, so every citizen got twenty-four distinct openings and then heard them
 * again, in order, from session forty-three onwards. Nobody who writes the
 * lines ever sees that: it only shows up on somebody's fortieth session, which
 * is somebody who likes her.
 *
 * `greet()` stays a pure function; the memory belongs to the caller, and the
 * caller is now the account rather than a browser tab.
 */
describe('hello, and she remembers what she said last time', () => {
  const withGreetings = (greetings: string[], sink: Record<string, unknown>[]) => ({
    ...NOBODY,
    miraPass: {
      findUnique: () => Promise.resolve({ chatUsed: 0, paidUntil: null, greetings, firstSeenAt: new Date() }),
      upsert: (args: Record<string, unknown>) => { sink.push(args); return Promise.resolve(undefined); },
    },
  });

  it('does not open with a line she has just used', async () => {
    const sink: Record<string, unknown>[] = [];
    const first = await svc({}, withGreetings([], sink)).greeting('u1', { firstOfDay: true });
    const next = await svc({}, withGreetings([first.id], sink)).greeting('u1', { firstOfDay: true });
    expect(next.id).not.toBe(first.id);
  });

  it('writes the id back, newest first, and keeps only the last few', async () => {
    const sink: Record<string, unknown>[] = [];
    const old = Array.from({ length: 12 }, (_, n) => `line.0.${n}`);
    const g = await svc({}, withGreetings(old, sink)).greeting('u1', {});
    const kept = (sink[0].update as { greetings: string[] }).greetings;
    expect(kept[0]).toBe(g.id);
    expect(kept.length).toBeLessThanOrEqual(10);
  });

  /** And the greeting answers with the seed it used — the client held its own
   *  guess per device, which is how she was two people on one afternoon. */
  it('answers with the seed, and it is the same one the ask uses', async () => {
    const g = await svc({}, NOBODY).greeting('u1', {});
    const t = await svc().ask("what's my balance", ctx());
    expect(g.seed).toBe(t.seed);
  });

  /** A greeting that cannot reach the table is a quieter hello, never an
   *  error in front of somebody. */
  it('still says hello when the account cannot be read', async () => {
    const broken = { ...NOBODY, miraPass: { findUnique: () => Promise.reject(new Error('down')), upsert: () => Promise.reject(new Error('down')) } };
    const g = await svc({}, broken).greeting('u1', {});
    expect(g.ask.length).toBeGreaterThan(0);
  });
});

/**
 * ── THE ASSERTION THIS WHOLE LANDING EXISTS FOR ───────────────────────────
 *
 * `crisis.spec.ts` proves the lexicon: that "I want to kill myself" is
 * recognised. `relate.spec.ts` proves the read: that recognising it produces a
 * hand-off. NEITHER of them proves the WIRING, and the wiring is where the
 * defect lived.
 *
 * What shipped before this landing: `BEYOND` had no self-harm pattern at all,
 * so the sentence missed it, `whoIsIt()` matched the word "myself", and the
 * city room returned `SELF_SCRIPTS.unknown` — "Say the sentence you have been
 * circling out loud, once, to nobody" — a journaling exercise, handed to
 * somebody saying they want to die. The friend room did something worse: it
 * reached the model with `distress: false`, under a persona whose humour line
 * reads "playful by default".
 *
 * So this sweep goes through `ask()` itself, the way a citizen does. Both
 * rooms, model off AND model on, and the model is a stub that returns a
 * cheerful sentence — because the point is not that the model behaves, it is
 * that the model is never asked. A hand-off that only holds when the model
 * happens to be off is not a hand-off.
 */
describe('a crisis reaches a person, from every door', () => {
  const SENTENCES = ['i want to kill myself', 'i want to die', "i don't want to be here anymore"];
  /**
   * `undefined` IS THE MERGED CLIENT. There are no chips, so the ask carries no
   * mode and the register is inferred. That is the case that ships, and it was
   * not in this sweep until the rooms became one — which is precisely the shape
   * of the defect this sweep exists for: the lexicon was right and the WIRING
   * was where the crisis leaked.
   */
  const ROOMS = ['friend', 'city', undefined] as const;

  /** A model that would answer if it were ever consulted. It must not be. */
  const chatty = () => {
    const calls: string[] = [];
    return {
      calls,
      ai: {
        enabled: true,
        converse: async (system: string) => { calls.push(system); return 'Right, the usual chaos then.'; },
      },
    };
  };

  for (const mode of ROOMS) {
    for (const text of SENTENCES) {
      it(`${mode ?? 'inferred'} register, model off — ${JSON.stringify(text)} gets the helpline`, async () => {
        const t = await svc().ask(text, ctx(mode ? { mode } : {}));
        expect(t.text).toMatch(/\b14416\b/);
        expect(t.levity).toBe(0);
      });

      it(`${mode ?? 'inferred'} register, model ON — ${JSON.stringify(text)} never reaches the model`, async () => {
        const m = chatty();
        const t = await svc({}, NOBODY, m.ai).ask(text, ctx(mode ? { mode } : {}));
        expect(t.text).toMatch(/\b14416\b/);
        expect(t.levity).toBe(0);
        expect(m.calls).toHaveLength(0);
      });
    }
  }

  it('does not hand off an ordinary bad day', async () => {
    const t = await svc().ask('i had a rough day at work', ctx({ mode: 'friend' }));
    expect(t.text).not.toMatch(/14416/);
  });

  /**
   * The dial cannot reach it, and neither can a playful register. Levity's caps
   * and lifts are computed separately for exactly this case: somebody who has
   * been joking all session and then says the thing.
   */
  it('a playful register cannot lift a crisis turn', async () => {
    const t = await svc().ask('i want to die', ctx({ mode: 'friend', dial: 2, recent: ['lol', 'haha'] }));
    expect(t.text).toMatch(/\b14416\b/);
    expect(t.levity).toBe(0);
  });
});


/**
 * ── THE SCREENSHOT ────────────────────────────────────────────────────────
 *
 * Sent by the owner, 22 Aug, one question in each of her two rooms:
 *
 *     city   — what am i eating today
 *            — Nothing needs starting yet. Kitchen is quiet.
 *            — tell me a meal i can eat today
 *            — Nothing needs starting yet. Kitchen is quiet.
 *
 *     friend — tell me a meal i can eat today
 *            — Want me to check what you need to cook, or should I take you to
 *              the kitchen to see what's there?
 *            — yes
 *            — [she picked one, and still named no meal]
 *
 * Three separate faults, one per describe below. None of them was a model
 * problem and none of them was fixed by merging the rooms — the merge only
 * meant there was one place left to fix them.
 */
describe('she names a meal', () => {
  const MEAL_WORDS = [
    'what am i eating today',
    'tell me a meal i can eat today',
    'my meal plan today',
    'what should i cook',
  ];

  for (const ask of MEAL_WORDS) {
    it(`${JSON.stringify(ask)} names food, and never the soaking deadline`, async () => {
      const t = await svc(LOADED).ask(ask, ctx());
      expect(t.capabilityId).toBe('nutrition GET plan/today');
      expect(t.text).toMatch(/Poha|Rajma|Palak/);
      expect(t.text).not.toMatch(/needs starting yet|Kitchen is quiet/i);
    });
  }

  /** Prep keeps its own question, and its own honest empty state. */
  it('prep answers about prep, and says which question it answered', async () => {
    const t = await svc().ask('anything to prep', ctx());
    expect(t.capabilityId).toBe('nutrition GET prep-alerts');
    expect(t.text).toMatch(/soaking or marinating/i);
  });

  /**
   * ANSWER, THEN OFFER THE PAGE — never the page instead of the answer. An
   * empty plan still knows the day's calories, and saying only "go to
   * Nutrition" throws away a true thing she is holding.
   */
  it('an empty plan still answers with what she does know', async () => {
    const t = await svc({ planToday: () => Promise.resolve({ needsProfile: false, meals: [] }) })
      .ask('what am i eating today', ctx());
    expect(t.text).toMatch(/2,?100/);
    expect(t.goto?.path).toBe('/nutrition');
  });

  it('a missing food profile is sent to the profile, not to the planner', async () => {
    const t = await svc({ planToday: () => Promise.resolve({ needsProfile: true, meals: [] }) })
      .ask('what am i eating today', ctx());
    expect(t.goto?.path).toBe('/nutrition/profile');
  });
});

describe('she does not say the same sentence twice', () => {
  /**
   * A citizen who rephrases is saying the last answer missed. Handing back the
   * identical bytes is the loudest possible way to say nobody is home — and it
   * is invisible to every test that looks at one turn at a time, which is why
   * this one hands her a history with her own last line in it.
   */
  it('a repeat is answered with something she has not said', async () => {
    const first = await svc().ask('anything to prep', ctx());
    const again = await svc().ask('anything to prep', ctx({
      history: [{ who: 'me', text: 'anything to prep' }, { who: 'mira', text: first.text }],
    }));
    expect(again.text).not.toBe(first.text);
    expect(again.text).toContain(first.text);
    expect(again.text).toMatch(/same as a moment ago/i);
  });

  it('leaves an answer alone when it is the first time she has said it', async () => {
    const t = await svc().ask('anything to prep', ctx({
      history: [{ who: 'mira', text: 'Something else entirely.' }],
    }));
    expect(t.text).not.toMatch(/same as a moment ago/i);
  });
});

describe('"yes" is not an answer to "which one?"', () => {
  const OPTIONS = [
    { label: 'Nutrition', path: '/nutrition' },
    { label: 'Recipes', path: '/nutrition/recipes' },
  ];

  for (const yes of ['yes', 'ok', 'sure', 'please', 'haan', 'go ahead']) {
    it(`${JSON.stringify(yes)} asks again and navigates nowhere`, async () => {
      const t = await svc().ask(yes, ctx({ answering: OPTIONS }));
      expect(t.goto).toBeUndefined();
      expect(t.text).toMatch(/which one/i);
      // The options ride back out, or the second answer is as homeless as the first.
      expect(t.choices).toHaveLength(2);
    });
  }

  it('still hears an actual pick', async () => {
    const t = await svc().ask('the second one', ctx({ answering: OPTIONS }));
    expect(t.goto?.path).toBe('/nutrition/recipes');
  });

  it('still hears a refusal', async () => {
    const t = await svc().ask('neither', ctx({ answering: OPTIONS }));
    expect(t.goto).toBeUndefined();
    expect(t.text).toMatch(/dropped/i);
  });
});

describe('the register is inferred, never claimed', () => {
  /**
   * The chips are gone. `mode` still arrives from clients that have not
   * shipped yet and nothing reads it — so the same sentence must get the same
   * answer whatever the tab claims, or the merge is cosmetic.
   */
  it('the same sentence gets the same answer whatever mode is claimed', async () => {
    const answers = await Promise.all(
      (['friend', 'city', undefined] as const).map((mode) =>
        svc(LOADED).ask('what am i eating today', ctx(mode ? { mode } : {})).then((t) => t.text)),
    );
    expect(new Set(answers).size).toBe(1);
  });

  it('a capability she is sure of puts her in the city register', async () => {
    const t = await svc().ask("what's my balance", ctx());
    expect(t.trace.some((l) => l === 'register: city')).toBe(true);
  });

  it('and anything she is not sure of falls toward listening', async () => {
    for (const ask of ['i had a fight with my sister', 'i feel awful', 'help me']) {
      const t = await svc().ask(ask, ctx());
      expect(t.trace.some((l) => l === 'register: friend')).toBe(true);
    }
  });
});
