import { MiraService } from './mira.service';

/**
 * ── THE WIRING, WHICH IS WHERE THE DEFECT ALWAYS IS ───────────────────────
 *
 * `fact.spec.ts` proves the filter. This proves the three things the filter
 * cannot: that the extraction runs on the turns it should, NEVER on the ones
 * it must not, and that what she has learned actually reaches the prompt.
 *
 * The crisis lane taught this lesson on 21 Aug — the lexicon was right and the
 * wiring was where the leak was.
 */
function bare(over: Record<string, any> = {}) {
  const svc: any = Object.create(MiraService.prototype);
  svc.logger = { warn: () => undefined, log: () => undefined };
  svc.registry = { upTo: () => [], byId: () => undefined, all: () => [] };
  svc.ledger = { record: () => undefined, forget: async () => undefined };
  svc.ai = {
    enabled: true,
    converse: async (system: string) => { svc.__system = [...(svc.__system ?? []), system]; return 'Yeah, that sounds about right.'; },
    json: async (_s: string, user: string) => {
      svc.__extracted = [...(svc.__extracted ?? []), user];
      return { facts: [{ subject: 'coffee', value: 'black, twice a day', confidence: 'known' }] };
    },
  };
  svc.prisma = {
    miraPass: { findUnique: async () => null, upsert: async () => undefined },
    miraTurn: { findMany: async () => [], createMany: async () => undefined, deleteMany: async () => ({ count: 0 }) },
    miraFact: {
      findMany: async () => svc.__stored ?? [],
      upsert: async (a: any) => { svc.__saved = [...(svc.__saved ?? []), a]; },
      deleteMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    user: { findUnique: async () => ({ name: 'Somen' }) },
  };
  svc.astrology = { getProfile: async () => null };
  Object.assign(svc, over);
  return svc;
}
const ctx = (o: Record<string, unknown> = {}) => ({ userId: 'u1', weeksKnown: 12, hour: 14, tz: 'Asia/Kolkata', ...o });
/** The extraction is fire-and-forget on purpose — it must never slow an answer
 *  down. So the assertion has to let the microtask land. */
const settle = () => new Promise((r) => setTimeout(r, 5));

describe('she learns from a conversation', () => {
  it('extracts after a turn the model answered, and upserts by subject', async () => {
    const svc = bare();
    await svc.ask('i drink my coffee black, twice a day', ctx());
    await settle();
    expect(svc.__extracted).toHaveLength(1);
    expect(svc.__saved).toHaveLength(1);
    expect(svc.__saved[0].where).toEqual({ userId_subject: { userId: 'u1', subject: 'coffee' } });
    // The sentence it came from is kept, so "why do you know that?" has an answer.
    expect(svc.__saved[0].create.sourceText).toContain('coffee black');
  });

  /**
   * ── AND NEVER FROM SOMEBODY AT THEIR LOWEST ───────────────────────────
   *
   * A distressed turn is not material. This is the assertion that matters most
   * in the file: everything else costs a fact, and this costs a person's worst
   * evening becoming a permanent line in a profile.
   */
  it('never mines a distressed turn', async () => {
    const svc = bare();
    await svc.ask('i want to die', ctx());
    await settle();
    expect(svc.__extracted).toBeUndefined();
    expect(svc.__saved).toBeUndefined();
  });

  it('never mines a turn a capability answered — the meter was not spent on talking', async () => {
    const CAP = {
      id: 'demo GET plan', controller: 'd.ts', method: 'GET', path: 'demo/plan',
      intent: 'read your demo plan', risk: 'R0' as const, utterances: ['my fitness plan'],
    };
    const svc = bare({ registry: { upTo: () => [CAP], byId: () => CAP, all: () => [CAP] } });
    svc.fitness = { plan: async () => ({ focus: 'Lower body' }) };
    await svc.ask('my fitness plan', ctx());
    await settle();
    expect(svc.__extracted).toBeUndefined();
  });

  it('does nothing at all with no model configured', async () => {
    const svc = bare({ ai: { enabled: false, converse: async () => null, json: async () => ({ facts: [] }) } });
    await svc.ask('i drink my coffee black', ctx());
    await settle();
    expect(svc.__saved).toBeUndefined();
  });
});

describe('and what she learned reaches the prompt', () => {
  it('the persona carries the facts, and says how sure she is', async () => {
    const svc = bare({});
    svc.__stored = [
      { id: '1', subject: 'coffee', value: 'black, twice a day', confidence: 'known', sourceText: 'x', updatedAt: new Date() },
      { id: '2', subject: 'running', value: 'mornings', confidence: 'likely', sourceText: 'y', updatedAt: new Date() },
    ];
    await svc.ask('what should i do this evening', ctx());
    const system = (svc.__system ?? []).join('\n');
    expect(system).toContain('coffee: black, twice a day');
    expect(system).toContain('running: mornings (likely)');
    expect(system).toMatch(/never assert it back to them as fact/i);
  });

  it('and says nothing about it on the first day', async () => {
    const svc = bare();
    await svc.ask('what should i do this evening', ctx());
    const system = (svc.__system ?? []).join('\n');
    expect(system).not.toMatch(/What you know about them/i);
  });

  it('a facts table that is down costs the block, never the answer', async () => {
    const svc = bare();
    svc.prisma.miraFact.findMany = async () => { throw new Error('table is down'); };
    const t = await svc.ask('what should i do this evening', ctx());
    expect(t.text).toBeTruthy();
  });
});

describe('the citizen can read it and delete it', () => {
  it('serves their own facts with the sentence each came from', async () => {
    const svc = bare();
    svc.__stored = [{ id: '1', subject: 'coffee', value: 'black', confidence: 'known', sourceText: 'i drink it black', updatedAt: new Date(5) }];
    const out = await svc.knows('u1');
    expect(out.facts[0]).toEqual({
      id: '1', subject: 'coffee', value: 'black', confidence: 'known',
      why: 'i drink it black', at: new Date(5).toISOString(),
    });
  });

  it('a delete is scoped to the asker, never to an id alone', async () => {
    const svc = bare();
    let seen: any;
    svc.prisma.miraFact.deleteMany = async (a: any) => { seen = a; return { count: 1 }; };
    await svc.forgetFact('u1', 'f9');
    expect(seen).toEqual({ where: { id: 'f9', userId: 'u1' } });
  });
});
