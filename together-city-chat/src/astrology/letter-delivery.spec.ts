import { AstrologyService } from './astrology.service';
import { salutationFor } from './letter';

/**
 * A letter that could not be written is never cached, and never faked.
 *
 * This is the load-bearing claim of the whole surface and the one that is
 * cheapest to break by accident. The daily and monthly readings are cached per
 * period — that is what makes them stable, and it is also what turns a single
 * bad minute into a whole day with nothing in it if the wrong thing gets
 * stored. The old cachedReading() wrote whatever its compute returned, because
 * its compute was deterministic and could not fail.
 *
 * There is a second claim underneath, and it is the reason the first one is not
 * simply "fall back to a template": this hub HAS no template any more. If these
 * tests could be made to pass by returning assembled prose, the letter would
 * have stopped being a letter and nobody would be able to tell from the screen.
 * So the no-writer case is asserted to produce `pending` specifically, and to
 * produce no prose at all.
 */

/**
 * A GOOD LETTER IS NOW A HUNDRED WORDS, NOT THREE HUNDRED.
 *
 * This fixture was five paragraphs, because a daily used to be 230–430
 * words. The owner cut it to 80–150 and the same text is now a rejection —
 * so the fixture had to shrink or every test here would be asserting
 * against a letter the service would refuse to send.
 */
const GOOD = [
  'There is something you have been circling for a few days, and my sense is that you decided what',
  'you think about it a while ago and have only been waiting for a decent moment. That moment is',
  'closer than it feels. Say it plainly when you do — the calm version of you is more persuasive',
  'than the rehearsed one, and people tend to hear the first one properly.',
  '',
  'The rest of the day rewards finishing over starting. One small deliberate step counts for more',
  'than a plan that covers everything, and none of it has to be solved before this evening.',
].join('\n');

/** Every letter now carries one, and a letter without one is not sent. */
const GOOD_TITLE = "Say It Plainly Today";

const BAD_HEADINGS = `${salutationFor('Somen')}\n\nCareer & Work:\n${GOOD}`;

/** A prisma stand-in that records what the service tried to store. */
function fakeDb() {
  const readings = new Map<string, string>();
  const writes: string[] = [];
  const key = (a: { where: { userId_kind_period: { userId: string; kind: string; period: string } } }) => {
    const k = a.where.userId_kind_period;
    return `${k.userId}|${k.kind}|${k.period}`;
  };
  return {
    writes,
    readings,
    prisma: {
      astroProfile: {
        findUnique: () => Promise.resolve({
          id: 'p1', userId: 'u1', birthDate: new Date('1991-06-10T00:00:00Z'), birthTime: '09:45',
          birthCountry: 'India', birthState: 'Karnataka', birthCity: 'Bengaluru',
          timeZone: 'Asia/Kolkata', lat: 12.97, lng: 77.59, updatedAt: new Date(),
        }),
        upsert: () => Promise.resolve(null),
      },
      astroReading: {
        findUnique: (a: Parameters<typeof key>[0]) => {
          const hit = readings.get(key(a));
          return Promise.resolve(hit ? { readingJson: hit } : null);
        },
        upsert: (a: Parameters<typeof key>[0] & { create: { readingJson: string } }) => {
          writes.push(a.create.readingJson);
          readings.set(key(a), a.create.readingJson);
          return Promise.resolve({ readingJson: a.create.readingJson });
        },
        findMany: () => Promise.resolve([]),
        deleteMany: () => Promise.resolve(null),
      },
      astroQuestion: { create: () => Promise.resolve(null), findMany: () => Promise.resolve([]) },
      user: { findUnique: () => Promise.resolve({ name: 'Somen Kumar' }) },
      datingProfile: { findUnique: () => Promise.resolve(null) },
    },
  };
}

/**
 * An AI stand-in that answers with whatever the test hands it, in order.
 *
 * It returns a valid TITLE with every letter, because the title is validated
 * as strictly as the body and a fake that omitted it would make every test in
 * this file fail for a reason none of them is about. The one test that cares
 * about a bad title passes its own.
 */
function fakeAi(enabled: boolean, ...answers: string[]) {
  const calls: string[] = [];
  return {
    calls,
    ai: {
      enabled,
      json: (_system: string, user: string) => {
        calls.push(user);
        const next = answers[Math.min(calls.length - 1, answers.length - 1)];
        return Promise.resolve(next === undefined ? {} : { title: GOOD_TITLE, letter: next });
      },
    },
  };
}

/** The same stand-in, with the title broken instead of the letter. */
function fakeAiTitled(title: string, letter: string) {
  const calls: string[] = [];
  return {
    calls,
    ai: {
      enabled: true,
      json: (_system: string, user: string) => { calls.push(user); return Promise.resolve({ title, letter }); },
    },
  };
}

const build = (prisma: unknown, ai: unknown) => new AstrologyService(
  prisma as never,
  { get: () => Promise.resolve(null), syncShared: () => Promise.resolve(null) } as never,
  {} as never,
  ai as never,
);

describe('delivering a letter', () => {
  it('sends the letter, and stores it once', async () => {
    const db = fakeDb();
    const w = fakeAi(true, `${salutationFor('Somen')}\n\n${GOOD}`);
    const out = await build(db.prisma, w.ai).daily('u1') as { pending?: boolean; body?: string; salutation?: string };

    expect(out.pending).toBe(false);
    expect((out as { title?: string }).title).toBe(GOOD_TITLE);
    expect(out.salutation).toBe('Dear Somen,');
    expect(out.body).toContain('There is something you have been circling');
    expect(db.writes).toHaveLength(1);
  });

  it('serves the stored letter without writing again', async () => {
    const db = fakeDb();
    const w = fakeAi(true, `${salutationFor('Somen')}\n\n${GOOD}`);
    const svc = build(db.prisma, w.ai);
    await svc.daily('u1');
    await svc.daily('u1');
    expect(w.calls).toHaveLength(1);   // the second read hit the cache
    expect(db.writes).toHaveLength(1);
  });

  it('says the letter is not ready when there is no writer — and invents nothing', async () => {
    const db = fakeDb();
    const w = fakeAi(false);
    const out = await build(db.prisma, w.ai).daily('u1') as Record<string, unknown>;

    expect(out.pending).toBe(true);
    expect(out.body).toBeUndefined();
    expect(out.salutation).toBeUndefined();
    // NOTHING CACHED. Storing this would mean no letter until tomorrow, and the
    // next request would not even try.
    expect(db.writes).toEqual([]);
    expect(w.calls).toEqual([]);
  });

  it('refuses a letter that breaks the rules, tells the writer why, and gives up honestly', async () => {
    const db = fakeDb();
    const w = fakeAi(true, BAD_HEADINGS, BAD_HEADINGS);
    const out = await build(db.prisma, w.ai).daily('u1') as Record<string, unknown>;

    // TWO RETRIES, NOT ONE, since "The brief asked for a letter the rules
    // forbid": each attempt narrows what the letter is asked to carry, so the
    // later ones are cheaper to satisfy rather than the same ask repeated. What
    // has not changed is the ending — it gives up rather than serving something
    // that breaks the rules, and it stores nothing.
    expect(w.calls).toHaveLength(3);
    expect(w.calls[1]).toContain('A previous attempt was rejected for');
    expect(w.calls[1]).toContain('section label');         // named, so it can be fixed
    expect(out.pending).toBe(true);
    expect(out.body).toBeUndefined();
    expect(db.writes).toEqual([]);
  });

  it('takes the second attempt when the first is fixed', async () => {
    const db = fakeDb();
    const w = fakeAi(true, BAD_HEADINGS, `${salutationFor('Somen')}\n\n${GOOD}`);
    const out = await build(db.prisma, w.ai).daily('u1') as Record<string, unknown>;

    expect(w.calls).toHaveLength(2);
    expect(out.pending).toBe(false);
    expect(db.writes).toHaveLength(1);
  });

  it('refuses a perfectly good letter under a title that names the product', async () => {
    // The body is clean and the title is "Daily Horoscope". Nothing in the
    // letter's own checks would notice, and the title is the line everybody
    // reads — so it is validated on the same pass and rejects the whole thing.
    const db = fakeDb();
    const w = fakeAiTitled('Daily Horoscope', `${salutationFor('Somen')}\n\n${GOOD}`);
    const out = await build(db.prisma, w.ai).daily('u1') as Record<string, unknown>;

    expect(out.pending).toBe(true);
    expect(w.calls[1]).toContain('A previous attempt was rejected for');
    expect(db.writes).toEqual([]);
  });

  it('never hands the writer the vocabulary it is forbidden to use', async () => {
    // The prompt is the only thing the writer sees. If the machinery reaches it
    // there, no amount of instruction downstream matters — it will come back.
    const db = fakeDb();
    const w = fakeAi(true, `${salutationFor('Somen')}\n\n${GOOD}`);
    await build(db.prisma, w.ai).daily('u1');
    const prompt = w.calls[0];
    for (const leak of [/\bSaturn\b/, /\bTaurus\b/, /\bdasha\b/i, /\blife path\b/i, /\bretrograde\b/i, /\bchart\b/i]) {
      expect({ leak: String(leak), prompt: leak.test(prompt) }).toEqual({ leak: String(leak), prompt: false });
    }
  });
});
