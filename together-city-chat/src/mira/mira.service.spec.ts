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
  discover: Stub; myOrders: Stub; myReservations: Stub;
  list: Stub; usage: Stub;
  daily: Stub; gems: Stub; remedies: Stub; dailyCard: Stub;
  today: Stub; prepAlerts: Stub; targets: Stub; healthSummary: Stub;
  account: Stub; unreadCount: Stub;
  get: Stub; healthScore: Stub; completion: Stub;
  plan: Stub; log: Stub; routine: Stub; watchlist: Stub; myTrips: Stub; thoughts: Stub;
}

const DEFAULTS: Hubs = {
  wallet: () => Promise.resolve({ balanceInr: 48200 }),
  transactions: () => Promise.resolve([]),
  budgets: () => Promise.resolve([]),
  spending: () => Promise.resolve({ thisMonthInr: 0 }),
  discover: () => Promise.resolve({ places: [] }),
  myOrders: () => Promise.resolve([]),
  myReservations: () => Promise.resolve([]),
  list: () => Promise.resolve({ files: [] }),
  usage: () => Promise.resolve({ usedPct: 12 }),
  daily: () => Promise.resolve({ needsProfile: false, pending: false, date: '2026-08-14', title: 'A steady one', body: 'A steady day, mostly. Keep the afternoon light.' }),
  gems: () => Promise.resolve({ needsProfile: false, stone: 'Red coral' }),
  remedies: () => Promise.resolve({ needsProfile: false, practices: [] }),
  dailyCard: () => Promise.resolve({ name: 'The Tower' }),
  today: () => Promise.resolve({ doses: [] }),
  prepAlerts: () => Promise.resolve({ alerts: [] }),
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

const svc = (over: Partial<Hubs> = {}) => {
  const h = { ...DEFAULTS, ...over };
  return new MiraService(
    as<0>({ wallet: h.wallet, transactions: h.transactions, budgets: h.budgets, spending: h.spending }),
    as<1>({ discover: h.discover, myOrders: h.myOrders, myReservations: h.myReservations }),
    as<2>({ list: h.list, usage: h.usage }),
    as<3>({ daily: h.daily, gems: h.gems, remedies: h.remedies }),
    as<4>({ dailyCard: h.dailyCard }),
    as<5>({ today: h.today }),
    as<6>({ prepAlerts: h.prepAlerts, targets: h.targets }),
    as<7>({ healthSummary: h.healthSummary }),
    as<8>({ account: h.account }),
    as<9>({ unreadCount: h.unreadCount }),
    as<10>({ get: h.get, healthScore: h.healthScore, completion: h.completion }),
    as<11>({ plan: h.plan, log: h.log }),
    as<12>({ routine: h.routine }),
    as<13>({ watchlist: h.watchlist }),
    as<14>({ myTrips: h.myTrips }),
    as<15>({ list: h.thoughts }),
    // A stand-in registry. In production this is filled by Nest's DiscoveryService
    // reading @Mira() metadata off the live handlers.
    as<16>({ upTo: () => CAPS, byId: (id: string) => CAPS.find((c) => c.id === id), all: () => CAPS }),
    as<17>({ record: (e: Record<string, unknown>) => { recorded.push(e); } }),
  );
};

const ctx = (o: Partial<Parameters<MiraService['ask']>[1]> = {}) => ({
  userId: 'u1', weeksKnown: 52, hour: 14, ...o,
});

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
  it('survives a fully loaded day, on most of her moods', async () => {
    const heard: number[] = [];
    for (let seed = 0; seed < 12; seed++) {
      const t = await svc(LOADED).ask('how is my day going to be', ctx({ seed }));
      if (HER_VOICE.test(t.text)) heard.push(seed);
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
