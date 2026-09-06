import { natalChart, scanMonth } from './astro-engine';
import { composeAnswerBrief, composeDailyBrief, composeMonthlyBrief } from './astro-content';
import { computeNumerology, vimshottariDasha } from './personal-factors';
import { bannedVocabulary } from './letter';
import { violations } from './voice';

const born1 = new Date('1991-06-10T00:00:00Z');
const born2 = new Date('1985-12-02T00:00:00Z');
const chart = natalChart(born1, '09:45', 'Asia/Kolkata', 12.97, 77.59);
const chart2 = natalChart(born2, '22:10', 'Asia/Kolkata', 28.61, 77.21);

/** The existing tests hand one Date; a brief now takes the citizen's day AND
 *  the instant, so this helper spells the same moment both ways. */
const briefOn = (c: typeof chart, born: Date, seed: string, day: Date) =>
  composeDailyBrief(c, seed, { date: day.toISOString().slice(0, 10), at: day },
    computeNumerology(born, day), vimshottariDasha(c.moon.lon, born, day));

const monthlyOn = (c: typeof chart, born: Date, seed: string, month: number) => {
  const on = new Date(`2026-${String(month).padStart(2, '0')}-05T00:00:00Z`);
  return composeMonthlyBrief(c, seed, scanMonth(c, 2026, month), computeNumerology(born, on), vimshottariDasha(c.moon.lon, born, on));
};

describe('astro-content', () => {
  it('the daily brief is personal and stable for a person and a day', () => {
    const day = new Date('2026-07-22T09:00:00Z');
    const a = briefOn(chart, born1, 'user-1', day);
    expect(a.observations.length).toBeGreaterThanOrEqual(8);
    expect(briefOn(chart, born1, 'user-1', day).observations).toEqual(a.observations);
    expect(briefOn(chart2, born2, 'user-2', day).observations).not.toEqual(a.observations);
  });

  it('the daily brief moves between days for the same person', () => {
    const a = briefOn(chart, born1, 'user-1', new Date('2026-07-22T09:00:00Z'));
    const b = briefOn(chart, born1, 'user-1', new Date('2026-11-23T09:00:00Z'));
    expect(a.observations).not.toEqual(b.observations);
  });

  it('the monthly brief carries the month and enough to write a long letter from', () => {
    const m = monthlyOn(chart, born1, 'user-1', 7);
    expect(m.month).toBe('July 2026');
    expect(m.observations.length).toBeGreaterThanOrEqual(15);
    expect(monthlyOn(chart, born1, 'user-1', 7).observations).toEqual(m.observations);
    expect(monthlyOn(chart2, born2, 'user-2', 7).observations).not.toEqual(m.observations);
  });

  it('the consultation brief is notes, never a drafted answer', () => {
    const astro = scanMonth(chart, 2026, 7);
    const b = composeAnswerBrief(chart, 'user-1', 'Career', 'Should I change my job this year?', new Date('2026-07-22T09:00:00Z'), astro);
    expect(b.observations.length).toBeGreaterThanOrEqual(8);
    // THE POINT OF THE CHANGE. A brief that is secretly a draft — one long
    // paragraph per note, in the order they should be said — puts the template
    // straight back, and the model would faithfully reproduce it again.
    for (const o of b.observations) {
      expect(o.split(/[.!?]/).filter((x) => x.trim()).length).toBeLessThanOrEqual(2);
    }
    expect(b.note.toLowerCase()).toContain('career');
    // and it moves with the topic, not just with the person
    const other = composeAnswerBrief(chart, 'user-1', 'Health', 'Should I change my job this year?', new Date('2026-07-22T09:00:00Z'), astro);
    expect(other.note).not.toBe(b.note);
  });

  /**
   * The voice guarantee — the reason voice.ts and letter.ts exist.
   *
   * Swept across two charts, several dates and every topic rather than checked
   * once, because the composers pick from pools and branch on sign, element and
   * retrograde state. A single sample can pass while a branch nobody exercised
   * still says "Mercury retrograde in Gemini". The two charts have different
   * suns, moons and ascendants, so between them they reach most of the
   * sign-dependent phrasing.
   *
   * THE BRIEFS ARE HELD TO THE STRICTER BAR — bannedVocabulary() rather than
   * violations(). The brief is the only thing the writer ever sees, so anything
   * in it can come back verbatim in the letter. A brief that says "their Saturn
   * period" is a leak with one extra step in it, and the writer would be right
   * to think the word was permitted.
   */
  describe('never exposes the machinery', () => {
    const days = ['2026-01-14', '2026-03-02', '2026-07-22', '2026-09-30', '2026-12-11'].map((d) => new Date(`${d}T09:00:00Z`));

    it('the daily brief is safe to hand to a writer, across charts and dates', () => {
      for (const [c, born] of [[chart, born1], [chart2, born2]] as const) {
        for (const day of days) {
          const b = briefOn(c, born, 'seed-user', day);
          const text = [...b.observations, b.note].join('\n');
          const iso = day.toISOString().slice(0, 10);
          expect({ day: iso, found: [...bannedVocabulary(text), ...violations(text)] }).toEqual({ day: iso, found: [] });
        }
      }
    });

    it('the monthly brief is safe to hand to a writer, across charts and months', () => {
      for (const [c, born] of [[chart, born1], [chart2, born2]] as const) {
        for (const month of [1, 4, 7, 11]) {
          const m = monthlyOn(c, born, 'seed-user', month);
          const text = [...m.observations, m.note].join('\n');
          expect({ month: m.month, found: [...bannedVocabulary(text), ...violations(text)] }).toEqual({ month: m.month, found: [] });
        }
      }
    });

    /**
     * ── THE MONTH, DATE BY DATE (owner, 6 Sep) ────────────────────────────
     *
     * "They should know everything that can happen the entire month, date
     * wise." `scanMonth` had always found more dated events than the brief was
     * told about — every ingress and every station — and only the two lunations
     * reached it. A letter asked to walk the month had four numbers to work
     * with and nothing about WHEN the month changes character.
     */
    it('tells the writer when the month opens, turns, slows and closes', () => {
      for (const month of [1, 4, 7, 11]) {
        const text = monthlyOn(chart, born1, 'user-1', month).observations.join('\n');
        // Days of the month, written as days — the only numbers that reach a
        // citizen, and the spine the letter is walked along.
        expect({ month, dated: /\b\d{1,2}(?:st|nd|rd|th)\b/.test(text) }).toEqual({ month, dated: true });
        /* EACH WINDOW IS SPOKEN TO EITHER WAY. A month with no strong day in
           its last third does not get silence there — it gets the sentence
           that says so, which is the more useful half of the pair. April 2026
           is that month, and it is why this reads for both. */
        const windows: Array<[string, RegExp]> = [
          ['opens', /opening stretch|first week of the month is unremarkable/],
          ['closes', /last stretch|month thins out toward the end/],
          ['middles', /middle of the month/],
        ];
        for (const [window, re] of windows) {
          expect({ month, window, said: re.test(text) }).toEqual({ month, window, said: true });
        }
      }
    });

    it('translates a station and an ingress instead of naming them', () => {
      // The kind never travels. A station is "replies come slower"; an ingress
      // is "the tone changes". A reader must be able to put their diary beside
      // the letter without ever meeting what produced it — which the banned
      // vocabulary sweep above enforces for these lines too.
      const text = monthlyOn(chart, born1, 'user-1', 7).observations.join('\n');
      expect(/replies come slower|Arrangements hold their shape/.test(text)).toBe(true);
      expect(/the tone changes|one steady temperature/.test(text)).toBe(true);
    });

    it('asks for the month walked in order, and for a life covered once', () => {
      const note = monthlyOn(chart, born1, 'user-1', 7).note;
      expect(note).toContain('time order');
      expect(note).toContain('never as a list');
      expect(note).toMatch(/work, .*money, .*people closest to them and their body/);
    });

    it('the consultation brief is safe to hand to a writer, across every topic', () => {
      const astro = scanMonth(chart, 2026, 7);
      const topics = ['Career', 'Marriage', 'Relationships', 'Business', 'Investments', 'Education',
        'Children', 'Foreign travel', 'Property', 'Health', 'Spiritual growth'];
      for (const topic of topics) {
        const b = composeAnswerBrief(chart, 'user-1', topic, `What should I know about my ${topic.toLowerCase()} right now?`, new Date('2026-07-22T09:00:00Z'), astro);
        const text = [...b.observations, b.note].join('\n');
        expect({ topic, found: [...bannedVocabulary(text), ...violations(text)] }).toEqual({ topic, found: [] });
      }
    });
  });
});
