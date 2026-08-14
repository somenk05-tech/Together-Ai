import { MiraService } from './mira.service';
import { PAYWALL_LINE } from './persona';

/**
 * SHE READS ONE CHAT — AND ONLY THAT ONE.
 *
 * The owner's brief, verbatim where it matters: "the tab only gives asses to
 * that chat box not entire context". The confidant is Mira invited into a
 * single person-to-person conversation, and the promise is SCOPE: the window
 * the citizen showed her is everything she can see.
 *
 * That promise is enforced by absence, so this spec asserts absences: a
 * successful confide never reads her memory, never writes to it, never loads
 * the chart or the name. The spies below would record any of those calls, and
 * the tests demand zero. CHECKED AGAINST THE CODE: point `confide()` at
 * `recall()` or `remember()` and the scope tests go red.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bare(over: Partial<Record<string, any>> = {}) {
  const svc: any = Object.create(MiraService.prototype);
  svc.__touched = [] as string[];
  svc.logger = { warn: () => undefined, log: () => undefined };
  svc.registry = { upTo: () => [], byId: () => undefined, all: () => [] };
  svc.ledger = { record: (e: any) => { svc.__ledger = [...(svc.__ledger ?? []), e]; } };
  svc.ai = {
    enabled: true,
    converse: async (system: string, turns: any[]) => {
      svc.__system = system;
      svc.__turns = turns;
      return 'They sound more hurt than angry, honestly.';
    },
  };
  svc.prisma = {
    miraPass: {
      findUnique: async () => svc.__pass ?? null,
      upsert: async () => { svc.__spent = (svc.__spent ?? 0) + 1; },
    },
    miraTurn: {
      findMany: async () => { svc.__touched.push('miraTurn.findMany'); return []; },
      createMany: async () => { svc.__touched.push('miraTurn.createMany'); },
      deleteMany: async () => { svc.__touched.push('miraTurn.deleteMany'); return { count: 0 }; },
    },
    user: { findUnique: async () => { svc.__touched.push('user.findUnique'); return { name: 'Somen' }; } },
  };
  svc.astrology = { getProfile: async () => { svc.__touched.push('astrology.getProfile'); return null; } };
  Object.assign(svc, over);
  return svc;
}

const CHAT = [
  { who: 'them' as const, text: 'you never text first anymore' },
  { who: 'me' as const, text: 'work has been a lot, i told you' },
  { who: 'them' as const, text: 'fine. whatever.' },
];

describe('the confidant reads the window she was shown', () => {
  it('the transcript reaches the model as ONE user message, both voices, named', async () => {
    const svc = bare();
    await svc.confide('u1', { otherName: 'Somen K', ask: 'where are they coming from?', transcript: CHAT });
    expect(svc.__turns).toHaveLength(1);
    expect(svc.__turns[0].role).toBe('user');
    expect(svc.__turns[0].content).toContain('Me: work has been a lot');
    expect(svc.__turns[0].content).toContain('Somen K: fine. whatever.');
    expect(svc.__turns[0].content).toContain('MY QUESTION: where are they coming from?');
  });

  it('the prompt tells her the window is everything, and drafts stay theirs', async () => {
    const svc = bare();
    await svc.confide('u1', { otherName: 'Somen K', ask: 'help me reply', transcript: CHAT });
    expect(svc.__system).toContain('the ONLY thing you can see');
    expect(svc.__system).toContain('THEIR voice');
    expect(svc.__system).toContain('cannot send anything');
  });
});

describe('and the scope is enforced by absence', () => {
  it('a successful confide touches no memory, no chart, no name', async () => {
    const svc = bare();
    const t = await svc.confide('u1', { ask: 'what is going on here?', transcript: CHAT });
    expect(t.text).toBe('They sound more hurt than angry, honestly.');
    // The whole promise, in one assertion: nothing beyond the window.
    expect(svc.__touched).toEqual([]);
  });

  it('nothing said here lands in her memory — theirs to show, never hers to keep', async () => {
    const svc = bare();
    await svc.confide('u1', { ask: 'help me reply', transcript: CHAT });
    expect(svc.__touched).not.toContain('miraTurn.createMany');
  });

  it('"forget everything" typed in this panel deletes nothing — there is nothing here to forget', async () => {
    const svc = bare();
    await svc.confide('u1', { ask: 'forget everything', transcript: CHAT });
    expect(svc.__touched).not.toContain('miraTurn.deleteMany');
  });
});

describe('the hand-off and the meter still outrank the model', () => {
  it('a crisis in the ask is answered by code, unmetered, before any model', async () => {
    const svc = bare();
    const t = await svc.confide('u1', { ask: 'he threatened me if i reply wrong', transcript: CHAT });
    expect(t.text).toContain('not something to work out with a better sentence');
    expect(svc.__turns).toBeUndefined();   // the model never saw a word
    expect(svc.__spent).toBeUndefined();   // and nobody paid for it
  });

  it('the two-hundredth-and-first conversation meets the same meter here', async () => {
    const svc = bare();
    svc.__pass = { chatUsed: 200, paidUntil: null };
    const t = await svc.confide('u1', { ask: 'help me reply', transcript: CHAT });
    expect(t.text).toBe(PAYWALL_LINE);
    expect(t.paywall).toBe(true);
    expect(svc.__turns).toBeUndefined();
  });

  it('a subscriber is unmetered — freeLeft is null, never 0', async () => {
    const svc = bare();
    svc.__pass = { chatUsed: 500, paidUntil: new Date(Date.now() + 86_400_000) };
    const t = await svc.confide('u1', { ask: 'help me reply', transcript: CHAT });
    expect(t.pass).toEqual({ freeLeft: null });
  });

  it('a reply that breaks her voice is dropped, and not billed', async () => {
    const svc = bare({
      ai: { enabled: true, converse: async () => 'Great question! They are clearly upset.' },
    });
    const t = await svc.confide('u1', { ask: 'help me reply', transcript: CHAT });
    expect(t.text).toContain('Ask me plainly');
    expect(svc.__spent).toBeUndefined();
  });

  it('with no key she says so plainly, and spends nothing', async () => {
    const svc = bare({ ai: { enabled: false } });
    const t = await svc.confide('u1', { ask: 'help me reply', transcript: CHAT });
    expect(t.text).toContain('isn’t switched on');
    expect(svc.__spent).toBeUndefined();
  });
});
