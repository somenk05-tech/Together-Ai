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

const GOOD = [
  'Something has been sitting with you for a few days and my guess is you have already decided what',
  'you think, and are waiting for a decent moment to say it. That moment is closer than it feels.',
  'Say it plainly when you do — the calm version of you is far more persuasive than the rehearsed',
  'one, and people tend to hear it properly.',
  '',
  'Work is going to reward finishing over starting for a while yet. Not the most exciting thing to',
  'be told, but the effort you are putting in compounds quietly and only compounds if it stays',
  'consistent. One deliberate step counts for more this week than a plan that covers everything, and',
  'if your attention keeps drifting toward getting organised rather than getting ahead, let it. That',
  'instinct is usually right about what the week actually needs from you.',
  '',
  'With the people close to you the small attentive gesture will land better than the grand one; it',
  'nearly always does. If a conversation matters, listen for longer than feels natural first. Keep',
  'the practical side simple — water, one proper meal, twenty unhurried minutes outside. Your energy',
  'is running restless rather than low, and restless responds to rhythm rather than to effort.',
  '',
  'Money is a good place to be patient. Nothing needs deciding this week that would not be decided',
  'better next week, and the only test worth applying before a commitment is whether it serves where',
  'you are actually heading. You already know the answer for most of them, which is usually the',
  'point at which people stop asking and start moving.',
  '',
  'Whatever today turns out to be, you do not have to solve all of it at once. Moving with a clear',
  'head is worth more than moving quickly, and a fair amount of what is on your mind will look',
  'smaller by tomorrow evening.',
].join('\n');

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

/** An AI stand-in that answers with whatever the test hands it, in order. */
function fakeAi(enabled: boolean, ...answers: string[]) {
  const calls: string[] = [];
  return {
    calls,
    ai: {
      enabled,
      json: (_system: string, user: string) => {
        calls.push(user);
        const next = answers[Math.min(calls.length - 1, answers.length - 1)];
        return Promise.resolve(next === undefined ? {} : { letter: next });
      },
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
    expect(out.salutation).toBe('Dear Somen,');
    expect(out.body).toContain('Something has been sitting with you');
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

    expect(w.calls).toHaveLength(2);                       // one retry, not more
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
