import { MiraService } from './mira.service';
import { readForget } from './forget';

/**
 * SHE REMEMBERS, AND SHE CAN BE TOLD TO FORGET.
 *
 * Every exchange now lands in MiraTurn — her memory, per citizen, per room —
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
  svc.ledger = { record: () => undefined };
  svc.ai = { enabled: true, converse: async () => 'Yeah, I remember.' };
  svc.prisma = {
    miraPass: { findUnique: async () => null, upsert: async () => undefined },
    miraTurn: {
      findMany: async () => [],
      createMany: async (args: any) => { svc.__written = [...(svc.__written ?? []), args]; },
      deleteMany: async (args: any) => { svc.__deleted = [...(svc.__deleted ?? []), args]; return { count: svc.__count ?? 0 }; },
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
  it('writes both sides of an exchange, into the room it was said in', async () => {
    const svc = bare();
    await svc.ask('just feeling lonely', ctx({ mode: 'friend' }));
    expect(svc.__written).toHaveLength(1);
    const rows = svc.__written[0].data;
    expect(rows.map((r: any) => r.who)).toEqual(['you', 'mira']);
    expect(rows[0].room).toBe('friend');
    expect(rows[0].text).toBe('just feeling lonely');
    // The reply is stamped after the question, so the pair reads back in order.
    expect(rows[1].createdAt.getTime()).toBeGreaterThan(rows[0].createdAt.getTime());
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
    await svc.ask('remember my dog?', ctx({ mode: 'friend' }));
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
    await svc.ask('and a third', ctx({ mode: 'friend' }));
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
    await expect(svc.thread('u1', 'city')).resolves.toEqual({ turns: [] });
  });
});

describe('and she can be told to forget', () => {
  it('"forget everything" deletes the whole record, scoped to the asker', async () => {
    const svc = bare();
    const t = await svc.ask('forget everything', ctx());
    expect(svc.__deleted).toHaveLength(1);
    expect(svc.__deleted[0].where).toEqual({ userId: 'u1' });
    expect(t.text).toMatch(/gone from my memory/i);
    // The wipe keeps no receipt: the forget exchange itself is not recorded.
    expect(svc.__written).toBeUndefined();
  });

  it('"forget about the loan" deletes what mentions it, and says how much', async () => {
    const svc = bare();
    svc.__count = 3;
    const t = await svc.ask('forget about the loan', ctx());
    expect(svc.__deleted[0].where.userId).toBe('u1');
    expect(svc.__deleted[0].where.text).toEqual({ contains: 'the loan', mode: 'insensitive' });
    expect(t.text).toContain('3 things');
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
    const t = await svc.ask('i forgot my keys again', ctx({ mode: 'friend' }));
    expect(svc.__deleted).toBeUndefined();
    expect(t.text).toBe('Yeah, I remember.');
  });
});
