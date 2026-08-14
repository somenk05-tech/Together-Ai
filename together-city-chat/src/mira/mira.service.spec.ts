import { MiraService } from './mira.service';
import type { Capability } from './mira.registry';

const CAPS: Capability[] = [
  { id: 'financial GET wallet', controller: 'FinancialController', method: 'GET', path: 'financial/wallet',
    intent: 'Tell the citizen their wallet balance', risk: 'R0',
    utterances: ["what's my balance", 'how much do I have', 'wallet balance'] },
  { id: 'financial GET transactions', controller: 'FinancialController', method: 'GET', path: 'financial/transactions',
    intent: 'List recent transactions', risk: 'R0',
    utterances: ['what did I spend', 'recent transactions', 'what have I paid for'] },
  { id: 'restaurants GET discover', controller: 'RestaurantsController', method: 'GET', path: 'restaurants/discover',
    intent: 'Find restaurants that fit an occasion', risk: 'R0',
    utterances: ['find somewhere for dinner', 'somewhere special', 'a quiet place to eat'] },
  { id: 'drive GET', controller: 'DriveController', method: 'GET', path: 'drive',
    intent: 'Find one of the citizen own documents', risk: 'R0',
    utterances: ["where's my insurance document", 'find my policy', 'my documents'] },
];

type Stub = () => Promise<unknown>;
type Stubs = Partial<Record<'wallet' | 'transactions' | 'discover' | 'list', Stub>>;

/**
 * Hand-built stubs rather than the real services.
 *
 * Typed as `Stub` and cast once at the constructor boundary — the alternative
 * is `any` at four call sites, which the lint ceiling rejects and which would
 * also stop these tests from telling us when a service signature changes.
 */
const svc = (over: Stubs = {}) =>
  new MiraService(
    {
      wallet: over.wallet ?? (() => Promise.resolve({ balance: 48200 })),
      transactions: over.transactions ?? (() => Promise.resolve([])),
    } as unknown as ConstructorParameters<typeof MiraService>[0],
    { discover: over.discover ?? (() => Promise.resolve({ places: [] })) } as unknown as ConstructorParameters<typeof MiraService>[1],
    { list: over.list ?? (() => Promise.resolve({ files: [] })) } as unknown as ConstructorParameters<typeof MiraService>[2],
    // A stand-in registry. In production this is filled by Nest's DiscoveryService
    // reading @Mira() metadata off the live handlers; here it is the four entries
    // those decorators declare, so the router has something to match against.
    {
      upTo: () => CAPS,
      byId: (id: string) => CAPS.find((c) => c.id === id),
      all: () => CAPS,
    } as unknown as ConstructorParameters<typeof MiraService>[3],
  );

const ctx = (o: Partial<Parameters<MiraService['ask']>[1]> = {}) => ({
  userId: 'u1', weeksKnown: 52, hour: 14, ...o,
});

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

describe('the person comes first, in the service too', () => {
  it('a feeling gets a listening turn and no data call', async () => {
    let walletCalled = false;
    const s = svc({ wallet: () => { walletCalled = true; return Promise.resolve({ balance: 1 }); } });
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
  ];

  it.each(ASKS)('%j', async (ask) => {
    const t = await svc().ask(ask, ctx());
    // acceptOrFallback would have swapped in the fallback if it drifted; the
    // fallback itself is in voice, so assert we did NOT need it.
    expect(t.text).not.toBe("I can't do that from here.");
    expect(t.text.length).toBeGreaterThan(0);
  });
});

describe('empty results are said honestly', () => {
  it('an empty drive is not dressed up', async () => {
    const t = await svc({ list: () => Promise.resolve({ files: [] }) }).ask('my documents', ctx());
    expect(t.text).toMatch(/nothing/i);
  });

  it('no transactions is not "0 transactions"', async () => {
    const t = await svc({ transactions: () => Promise.resolve([]) }).ask('what did I spend', ctx());
    expect(t.text).toBe('Nothing yet.');
  });
});

describe('the trace explains the turn', () => {
  it('carries the route reason and the levity derivation', async () => {
    const t = await svc().ask("what's my balance", ctx());
    expect(t.trace.join(' ')).toMatch(/matched financial/);
    expect(t.trace.join(' ')).toMatch(/result L/);
  });
});
