import { MiraService } from './mira.service';
import { readForget } from './forget';

/**
 * SHE REMEMBERS, AND SHE CAN BE TOLD TO FORGET.
 *
 * Every exchange now lands in MiraTurn — her memory, per citizen —
 * and the model's context is drawn from that record first, the device's day
 * store second. The promise that makes a memory tolerable is the way out:
 * "forget about <topic>" and "forget everything" genuinely delete, and they
 * are the ONLY write she performs anywhere in the city.
 *
 * The scariest bug this feature could have is deleting history off a figure
 * of speech, so the parser's negative cases get as many tests as the
 * feature. CHECKED AGAINST THE OLD CODE: with the forget seam removed from
 * turn(), the command tests fail — she chats about forgetting instead of
 * doing it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bare(over: Partial<Record<string, any>> = {}) {
  const svc: any = Object.create(MiraService.prototype);
  svc.logger = { warn: () => undefined, log: () => undefined };
  svc.registry = { upTo: () => [], byId: () => undefined, all: () => [] };
  svc.ledger = { record: () => undefined, forget: async (u: string, t?: string) => { svc.__ledgerForget = [...(svc.__ledgerForget ?? []), [u, t]]; } };
  svc.ai = { enabled: true, converse: async () => 'Yeah, I remember.' };
  svc.prisma = {
    miraPass: { findUnique: async () => null, upsert: async () => undefined },
    miraTurn: {
      /** `skip` is the retention trim asking for the 2000th-newest row. An
       *  empty answer means "nothing to trim", which is true of every stub
       *  here — without honouring it, every write would look like an overflow. */
      findMany: async (args: any) => (args?.skip ? [] : []),
      createMany: async (args: any) => { svc.__written = [...(svc.__written ?? []), args]; },
      deleteMany: async (args: any) => { svc.__deleted = [...(svc.__deleted ?? []), args]; return { count: svc.__count ?? 0 }; },
    },
    /** The durable half of her memory. See `fact.ts`. */
    miraFact: {
      findMany: async () => [],
      upsert: async (args: any) => { svc.__facts = [...(svc.__facts ?? []), args]; },
      deleteMany: async (args: any) => { svc.__factsDeleted = [...(svc.__factsDeleted ?? []), args]; return { count: 0 }; },
      count: async () => 0,
    },
    user: { findUnique: async () => ({ name: 'Somen' }) },
  };
  svc.astrology = { getProfile: async () => null };
  Object.assign(svc, over);
  return svc;
}

const ctx = (o: Record<string, unknown> = {}) => ({ userId: 'u1', weeksKnown: 12, hour: 14, tz: 'Asia/Kolkata', ...o });

describe('the forget reader tells a command from a figure of speech', () => {
  it('reads the commands', () => {
    expect(readForget('forget everything')).toEqual({ scope: 'everything' });
    expect(readForget('Mira, please forget all our chats')).toEqual({ scope: 'everything' });
    expect(readForget('forget about the loan')).toEqual({ scope: 'topic', topic: 'the loan' });
    expect(readForget('forget what i said about my boss')).toEqual({ scope: 'topic', topic: 'my boss' });
    expect(readForget('forget')).toEqual({ scope: 'unclear' });
    expect(readForget('forget it')).toEqual({ scope: 'dismiss' });
  });

  it('never reads a figure of speech as a deletion', () => {
    expect(readForget('i forgot my keys again')).toBeNull();
    expect(readForget("don't forget the milk")).toBeNull();
    expect(readForget('never forget where you came from')).toBeNull();
    expect(readForget('i keep forgetting things lately')).toBeNull();
    expect(readForget('how do i forget my ex')).toBeNull();
  });
});

describe('she remembers', () => {
  it('writes both sides of an exchange', async () => {
    const svc = bare();
    await svc.ask('just feeling lonely', ctx());
    expect(svc.__written).toHaveLength(1);
    const rows = svc.__written[0].data;
    expect(rows.map((r: any) => r.who)).toEqual(['you', 'mira']);
    // `room` is a dead column: required by the schema, read by nothing. Every
    // new row goes under the key the whole history is already under. Dropping
    // it is a migration that also rewrites an index, and is its own change.
    expect(rows[0].room).toBe('city');
    expect(rows[0].text).toBe('just feeling lonely');
    // The reply is stamped after the question, so the pair reads back in order.
    expect(rows[1].createdAt.getTime()).toBeGreaterThan(rows[0].createdAt.getTime());
  });

  it('but never a health answer — her record is a model prompt', async () => {
    /**
     * `fact.ts` refuses to keep health and medication as a durable fact and
     * says why at length. The transcript went round it: "2 still to take —
     * Metformin and Sertraline." was composed deterministically from the
     * medicines hub, written to `MiraTurn` with the question above it, and
     * `recall()` replays the last thirty rows verbatim into the Anthropic call
     * on the next ordinary chat turn. The answer is still shown, and still on
     * the device; it just never becomes context for a model.
     */
    const CAP = {
      id: 'medicines GET today', controller: 'p.ts', method: 'GET', path: 'medicines/today',
      intent: 'tell the citizen which medicines are due today', risk: 'R0' as const,
      utterances: ['what do i still have to take today'],
    };
    const svc = bare({ registry: { upTo: () => [CAP], byId: () => CAP, all: () => [CAP] } });
    svc.prescriptions = { today: async () => ({ doses: [{ medicine: 'Metformin', status: 'due' }, { medicine: 'Sertraline', status: 'due' }] }) };
    const t = await svc.ask('what do i still have to take today', ctx());
    expect(t.text).toContain('Metformin');
    expect(svc.__written).toBeUndefined();
  });

  it('the record is the context — the model sees past days, oldest first', async () => {
    let seen: any[] = [];
    const svc = bare({
      ai: { enabled: true, converse: async (_s: string, turns: any[]) => { seen = turns; return 'Bruno! How is he?'; } },
    });
    svc.prisma.miraTurn.findMany = async () => [
      { who: 'mira', text: 'Named after the song?', createdAt: new Date(2) },
      { who: 'you', text: 'my dog is called Bruno', createdAt: new Date(1) },
    ];
    await svc.ask('remember my dog?', ctx());
    expect(seen[0]).toEqual({ role: 'user', content: 'my dog is called Bruno' });
    expect(seen[seen.length - 1].role).toBe('user');
    expect(seen[seen.length - 1].content).toContain('remember my dog?');
  });

  it('a malformed record still makes a legal transcript', async () => {
    let seen: any[] = [];
    const svc = bare({
      ai: { enabled: true, converse: async (_s: string, turns: any[]) => { seen = turns; return 'Yeah.'; } },
    });
    // Leads with her own voice and doubles a role — both must be repaired.
    svc.prisma.miraTurn.findMany = async () => [
      { who: 'you', text: 'second thought', createdAt: new Date(3) },
      { who: 'you', text: 'first thought', createdAt: new Date(2) },
      { who: 'mira', text: 'orphaned reply', createdAt: new Date(1) },
    ];
    await svc.ask('and a third', ctx());
    expect(seen[0].role).toBe('user');
    for (let i = 1; i < seen.length; i++) expect(seen[i].role).not.toBe(seen[i - 1].role);
  });
});

describe('and the thread follows the account', () => {
  it('serves the record oldest first, shaped for the screen', async () => {
    const svc = bare();
    svc.prisma.miraTurn.findMany = async () => [
      { who: 'mira', text: 'Named after the song?', createdAt: new Date(2) },
      { who: 'you', text: 'my dog is called Bruno', createdAt: new Date(1) },
    ];
    const t = await svc.thread('u1', 'friend');
    expect(t.turns.map((x: any) => x.who)).toEqual(['you', 'mira']);
    expect(t.turns[0].text).toBe('my dog is called Bruno');
    expect(t.turns[0].at).toBe(new Date(1).toISOString());
  });

  it('a read that fails is an empty thread, never an error', async () => {
    const svc = bare();
    svc.prisma.miraTurn.findMany = async () => { throw new Error('table is down'); };
    await expect(svc.thread('u1')).resolves.toEqual({ turns: [] });
  });

  /**
   * A generated client that has never heard of `MiraFact` throws SYNCHRONOUSLY
   * on the property access, before there is a promise to `.catch()` on. That
   * is the one failure mode a deploy can actually produce — migration applied
   * after the code, or not at all — and the forget must survive it.
   */
  it('a forget still works when the facts table is unreachable', async () => {
    const svc = bare({ prisma: { ...bare().prisma, miraFact: undefined } });
    const t = await svc.ask('forget everything', ctx());
    expect(t.text).toMatch(/gone from my memory/i);
    expect(svc.__ledgerForget).toEqual([['u1', undefined]]);
  });
});

describe('and she can be told to forget', () => {
  it('"forget everything" deletes the whole record, scoped to the asker', async () => {
    const svc = bare();
    const t = await svc.ask('forget everything', ctx());
    expect(svc.__deleted).toHaveLength(1);
    expect(svc.__deleted[0].where).toEqual({ userId: 'u1' });
    // One turn, still: it is unambiguous and they said the word. And it
    // reaches the ledger's day files as well as her notebook.
    expect(svc.__ledgerForget).toEqual([['u1', undefined]]);
    // AND WHAT SHE LEARNED FROM IT. A wipe that clears the transcript and
    // leaves the derived profile standing keeps the worse half of the two.
    expect(svc.__factsDeleted).toEqual([{ where: { userId: 'u1' } }]);
    expect(t.text).toMatch(/gone from my memory/i);
    // The wipe keeps no receipt: the forget exchange itself is not recorded.
    expect(svc.__written).toBeUndefined();
  });

  /**
   * ── A SUBSTRING MASS-DELETE, UNCONFIRMED, WAS THE OLD SHAPE OF THIS ───────
   *
   * `deleteMany({ text: { contains: topic } })` in one turn. On "her" that is
   * there, where, other, together, mother and father — and the citizen never
   * saw a number before it happened. Two turns now, whole words, and both
   * halves of an exchange go together.
   */
  const LOAN = [
    { id: 't1', room: 'city', who: 'you', text: 'the loan is keeping me up', createdAt: new Date(1000) },
    { id: 't2', room: 'city', who: 'mira', text: 'How much is left on it?', createdAt: new Date(1001) },
    { id: 't3', room: 'city', who: 'you', text: 'the loansharks in that film were funnier', createdAt: new Date(2000) },
  ];
  /** The database narrows with `contains`; the word boundary is decided in JS. */
  const withLoans = (svc: any) => {
    svc.prisma.miraTurn.findMany = async (args: any) => {
      if (args?.skip) return [];
      if (args?.where?.text) return LOAN.filter((r) => r.text.toLowerCase().includes('the loan'));
      if (args?.where?.OR) return LOAN.filter((r) => r.createdAt.getTime() >= 1000 && r.createdAt.getTime() <= 1001).map((r) => ({ id: r.id }));
      return LOAN;
    };
  };

  it('"forget about the loan" counts and asks, and deletes nothing yet', async () => {
    const svc = bare();
    withLoans(svc);
    const t = await svc.ask('forget about the loan', ctx());
    expect(svc.__deleted).toBeUndefined();
    // "the loansharks" contains the topic and does not MENTION it.
    expect(t.text).toContain('1 thing');
    expect(t.text).toMatch(/say yes/i);
    expect(t.text).toContain('keeping me up');
  });

  it('and a yes on the next turn performs it — both halves of the exchange', async () => {
    const svc = bare();
    withLoans(svc);
    svc.prisma.miraPass.findUnique = async () => ({ forgetTopic: 'the loan', forgetAskedAt: new Date(), greetings: [] });
    const t = await svc.ask('yes', ctx());
    expect(svc.__deleted[0].where.userId).toBe('u1');
    // Her own reply goes with the question it answered, and the film does not.
    expect(svc.__deleted[0].where.id.in.sort()).toEqual(['t1', 't2']);
    expect(t.text).toMatch(/gone from my memory/i);
    // And the day files the ledger keeps are rewritten too — "truly gone" is
    // not true if the verbatim question sits in a log for thirty days.
    expect(svc.__ledgerForget).toEqual([['u1', 'the loan']]);
  });

  it('a no leaves it exactly where it was', async () => {
    const svc = bare();
    withLoans(svc);
    svc.prisma.miraPass.findUnique = async () => ({ forgetTopic: 'the loan', forgetAskedAt: new Date(), greetings: [] });
    const t = await svc.ask('no', ctx());
    expect(svc.__deleted).toBeUndefined();
    expect(t.text).toBe('Left it where it was.');
  });

  /** Ten minutes. A yes arriving an hour later is a yes to something else. */
  it('an ask nobody answered expires rather than waiting for a stray yes', async () => {
    const svc = bare();
    withLoans(svc);
    svc.prisma.miraPass.findUnique = async () => ({
      forgetTopic: 'the loan', forgetAskedAt: new Date(Date.now() - 60 * 60 * 1000), greetings: [],
    });
    const t = await svc.ask('yes', ctx());
    expect(svc.__deleted).toBeUndefined();
    expect(t.text).not.toMatch(/gone from my memory/i);
  });

  it('nothing matching is said plainly, not performed', async () => {
    const svc = bare();
    const t = await svc.ask('forget about the yacht', ctx());
    expect(t.text).toMatch(/nothing to forget/i);
  });

  it('"forget it" drops the subject and deletes nothing', async () => {
    const svc = bare();
    const t = await svc.ask('forget it', ctx());
    expect(t.text).toBe('Dropped.');
    expect(svc.__deleted).toBeUndefined();
  });

  it('a figure of speech reaches the friend, not the shredder', async () => {
    const svc = bare();
    const t = await svc.ask('i forgot my keys again', ctx());
    expect(svc.__deleted).toBeUndefined();
    expect(t.text).toBe('Yeah, I remember.');
  });
});


/**
 * ── HER MEMORY HAS AN END, AND A DOOR ─────────────────────────────────────
 *
 * MiraTurn grew for the life of the account — the same liability the ledger's
 * day files were given a retention window to avoid, with the citizen's name
 * attached and both voices in it. And it could be inspected in exactly one
 * way: by asking her. A record you can only interrogate conversationally is
 * one nobody can audit, including the person whose sentences are in it.
 */
describe('what she keeps is bounded, and can be read back', () => {
  it('drops the oldest once the record is past its ceiling', async () => {
    const svc = bare();
    // The trim asks for the 2000th-newest row; an answer means there is
    // something older than it, and everything older than it goes.
    svc.prisma.miraTurn.findMany = async (args: any) => (args?.skip ? [{ createdAt: new Date(500) }] : []);
    await svc.ask('just feeling lonely', ctx());
    // The write is floated and the trim follows it — let both land.
    await new Promise((r) => setTimeout(r, 5));
    expect(svc.__deleted).toHaveLength(1);
    expect(svc.__deleted[0].where).toEqual({ userId: 'u1', createdAt: { lt: new Date(500) } });
  });

  it('leaves a short record alone', async () => {
    const svc = bare();
    await svc.ask('just feeling lonely', ctx());
    await new Promise((r) => setTimeout(r, 5));
    expect(svc.__deleted).toBeUndefined();
  });

  it('serves the citizen their own record, newest first, a page at a time', async () => {
    const svc = bare();
    svc.prisma.miraTurn.count = async () => 2;
    svc.prisma.miraTurn.findMany = async (args: any) => {
      svc.__page = args;
      return [
        { who: 'mira', text: 'Named after the song?', createdAt: new Date(2) },
        { who: 'you', text: 'my dog is called Bruno', createdAt: new Date(1) },
      ];
    };
    const m = await svc.memory('u1', { limit: 20, offset: 40 });
    expect(m.total).toBe(2);
    expect(m.turns[0].text).toBe('Named after the song?');
    // ONE TRANSCRIPT, and the response does not name a room either. Two rooms
    // meant two memories of one citizen; the merge is worth nothing if she
    // still only remembers half of what was said to her.
    expect(svc.__page.where).toEqual({ userId: 'u1' });
    expect(svc.__page.skip).toBe(40);
    expect(svc.__page.take).toBe(20);
  });

  it('a read that fails is an empty page, never an error', async () => {
    const svc = bare();
    svc.prisma.miraTurn.count = async () => { throw new Error('table is down'); };
    await expect(svc.memory('u1', { limit: 10, offset: 0 })).resolves.toEqual({
      total: 0, limit: 10, offset: 0, turns: [],
    });
  });
});
