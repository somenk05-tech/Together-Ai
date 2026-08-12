import { AstrologyService } from './astrology.service';
import { DAILY_WORDS, letterPrompt, salutationFor } from './letter';

/**
 * THE BRIEF ASKED FOR A LETTER THE RULES FORBID.
 *
 * THE DEFECT THIS FILE EXISTS FOR, quoted from production on 12 August:
 *
 *   daily letter rejected (attempt 1): 155 words — longer than 150
 *   daily letter rejected (attempt 2): 187 words — longer than 150
 *   daily letter rejected (attempt 1): 191 words — longer than 150
 *   daily letter rejected (attempt 2): 187 words — longer than 150;
 *                                      30% shared phrasing — reuses a previous letter
 *
 * Four whole letters written and thrown away inside ten seconds, while the page
 * said "Today's letter isn't ready yet". The API key was fine and the writer
 * was answering: `letterPrompt` opened with "Every one of these must be
 * reflected somewhere in the letter" above eleven observations, and rule 4 of
 * `letterRules` capped the daily at 150 words and asked for the ONE thing worth
 * saying. Nobody can obey both. The writer chose coverage and went over, every
 * time, for as long as the brief was that shape.
 *
 * The retry made it worse rather than better: "fix every one of those and keep
 * everything else" is, when the fault is length, two instructions that cancel —
 * 155 words became 187.
 *
 * Three promises, tested separately because they fail separately:
 *   1. the brief names a subject and marks the rest optional;
 *   2. a draft that is only too long is handed back to be cut, not rewritten;
 *   3. a failure is remembered for a few minutes, so pressing "Check again"
 *      costs nothing.
 */

const OBS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

describe('the brief handed to the writer', () => {
  it('no longer demands that every observation be in the letter', () => {
    const p = letterPrompt(OBS, 'Somen', []);
    expect(p).not.toContain('Every one of these must be reflected');
  });

  it('names a subject and marks the rest optional, losing nothing', () => {
    const p = letterPrompt(OBS, 'Somen', [], undefined, 3);
    const subject = p.indexOf('WRITE ABOUT THESE');
    const optional = p.indexOf('ALSO TRUE, AND OPTIONAL');
    expect(subject).toBeGreaterThanOrEqual(0);
    expect(optional).toBeGreaterThan(subject);
    // The first three are the subject; the rest are below the line.
    for (const o of OBS.slice(0, 3)) expect(p.indexOf(`- ${o}`)).toBeLessThan(optional);
    for (const o of OBS.slice(3)) expect(p.indexOf(`- ${o}`)).toBeGreaterThan(optional);
    // and nothing was dropped on the way
    for (const o of OBS) expect(p).toContain(`- ${o}`);
  });

  it('says which rule wins when they disagree', () => {
    expect(letterPrompt(OBS, 'Somen', [], undefined, 3))
      .toContain('the length rule wins every argument');
  });

  it('is all subject when there is only a subject', () => {
    const p = letterPrompt(['only this'], 'Somen', [], undefined, 3);
    expect(p).toContain('- only this');
    expect(p).not.toContain('ALSO TRUE, AND OPTIONAL');
  });
});

const born = new Date('1985-05-22T00:00:00Z');
const profileRow = {
  id: 'p1', userId: 'u1', birthDate: born, birthTime: '09:15',
  birthCountry: 'India', birthState: 'Jharkhand', birthCity: 'Jamshedpur',
  timeZone: 'Asia/Calcutta', lat: 22.8, lng: 86.18, updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
/** A letter of exactly `n` body words, opening the way the validator insists. */
const draft = (n: number) => `${salutationFor('Somen')}\n\n${words(n)}.`;

/** The service with a writer whose answers this test chooses, and a record of
 *  every prompt it was given. */
function svc(answers: Array<{ title?: string; letter?: string }>) {
  const prompts: string[] = [];
  const prisma = {
    astroProfile: { findUnique: () => Promise.resolve(profileRow) },
    astroReading: {
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      upsert: () => Promise.resolve({ readingJson: '{}' }),
    },
    user: { findUnique: () => Promise.resolve({ name: 'Somen' }) },
  };
  const ai = {
    enabled: true,
    json: (_system: string, user: string) => {
      prompts.push(user);
      return Promise.resolve(answers[Math.min(prompts.length - 1, answers.length - 1)]);
    },
  };
  const s = new AstrologyService(
    prisma as never, { get: () => Promise.resolve(null) } as never, null as never, ai as never,
  );
  return { s, prompts };
}

describe('a draft that is only too long', () => {
  it('is handed back to be cut, with the count, the limit and the draft itself', async () => {
    const long = draft(DAILY_WORDS.max + 40);
    const { s, prompts } = svc([
      { title: 'A Title Of The Right Length', letter: long },
      { title: 'A Title Of The Right Length', letter: draft(DAILY_WORDS.min + 10) },
    ]);
    const out = await s.daily('u1');

    expect(prompts).toHaveLength(2);
    const retry = prompts[1];
    expect(retry).toContain(`${DAILY_WORDS.max + 40} words`);   // what it did
    expect(retry).toContain(`${DAILY_WORDS.min}–${DAILY_WORDS.max} words`); // what the limit is
    expect(retry).toContain('deleting whole sentences');        // how to fix it
    expect(retry).toContain(long);                              // its own draft, to cut
    // The old feedback did the opposite, and 155 words became 187.
    expect(retry).not.toContain('keep everything else');
    expect(out).toMatchObject({ pending: false });
  });

  it('asks for a different letter, not a shorter one, when the fault is not length', async () => {
    // A banned word cannot be cut out by deleting sentences around it, and
    // handing the draft back would carry it into the next attempt.
    const banned = `${salutationFor('Somen')}\n\n${words(100)} your horoscope today.`;
    const { s, prompts } = svc([
      { title: 'A Title Of The Right Length', letter: banned },
      { title: 'A Title Of The Right Length', letter: draft(DAILY_WORDS.min + 10) },
    ]);
    await s.daily('u1');

    expect(prompts[1]).toContain('Write a different letter');
    expect(prompts[1]).not.toContain('--- your draft ---');
  });

  it('narrows the subject on each retry rather than repeating the ask', async () => {
    const { s, prompts } = svc([{ title: 'A Title Of The Right Length', letter: draft(500) }]);
    await s.daily('u1');

    expect(prompts).toHaveLength(3);   // three attempts, then it stops
    // Lines that are bullets, above the optional line — an observation's own
    // prose may contain a dash, so counting substrings would flatter us.
    const subject = (p: string) => p.split('ALSO TRUE, AND OPTIONAL')[0]
      .split('\n').filter((l) => l.startsWith('- ')).length;
    expect(subject(prompts[0])).toBe(3);
    expect(subject(prompts[1])).toBe(2);
    expect(subject(prompts[2])).toBe(1);
  });
});

describe('a letter that could not be written', () => {
  it('is not attempted again on the next press of Check again', async () => {
    const { s, prompts } = svc([{ title: '', letter: '' }]);

    expect(await s.daily('u1')).toMatchObject({ pending: true });
    const spent = prompts.length;
    expect(spent).toBe(3);                       // three attempts, once

    expect(await s.daily('u1')).toMatchObject({ pending: true });
    expect(await s.daily('u1')).toMatchObject({ pending: true });
    expect(prompts).toHaveLength(spent);         // and nothing more was spent
  });

  it('is one generation when two tabs ask at the same moment', async () => {
    const { s, prompts } = svc([{ title: 'A Title Of The Right Length', letter: draft(100) }]);
    const [a, b] = await Promise.all([s.daily('u1'), s.daily('u1')]);
    expect(prompts).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it('does not hold a citizen back for somebody else\'s bad minute', async () => {
    const { s, prompts } = svc([{ title: '', letter: '' }]);
    await s.daily('u1');
    await s.daily('u2');
    expect(prompts).toHaveLength(6);   // three each — the hold is per citizen and period
  });
});
