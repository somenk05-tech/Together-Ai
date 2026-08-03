import { natalChart, scanMonth } from './astro-engine';
import { composeAnswer, composeDailyBrief, composeMonthlyBrief, wordCount } from './astro-content';
import { computeNumerology, vimshottariDasha } from './personal-factors';
import { bannedVocabulary } from './letter';
import { violations } from './voice';

const born1 = new Date('1991-06-10T00:00:00Z');
const born2 = new Date('1985-12-02T00:00:00Z');
const chart = natalChart(born1, '09:45', 'Asia/Kolkata', 12.97, 77.59);
const chart2 = natalChart(born2, '22:10', 'Asia/Kolkata', 28.61, 77.21);

const briefOn = (c: typeof chart, born: Date, seed: string, day: Date) =>
  composeDailyBrief(c, seed, day, computeNumerology(born, day), vimshottariDasha(c.moon.lon, born, day));

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

  it('consultation answers are detailed (300+ words), on-topic and vary by topic', () => {
    const astro = scanMonth(chart, 2026, 7);
    const ans = composeAnswer(chart, 'user-1', 'Career', 'Should I change my job this year or wait for a promotion?', new Date('2026-07-22T09:00:00Z'), astro);
    expect(wordCount(ans)).toBeGreaterThanOrEqual(300);
    expect(ans.toLowerCase()).toContain('career');
    const ans2 = composeAnswer(chart, 'user-1', 'Marriage', 'When is a good period for my wedding?', new Date('2026-07-22T09:00:00Z'), astro);
    expect(ans2).not.toBe(ans);
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

    it('consultation answers stay in voice across every topic', () => {
      const astro = scanMonth(chart, 2026, 7);
      const topics = ['Career', 'Marriage', 'Relationships', 'Business', 'Investments', 'Education',
        'Children', 'Foreign travel', 'Property', 'Health', 'Spiritual growth'];
      for (const topic of topics) {
        const ans = composeAnswer(chart, 'user-1', topic, `What should I know about my ${topic.toLowerCase()} right now?`, new Date('2026-07-22T09:00:00Z'), astro, 'Somen');
        expect({ topic, found: violations(ans) }).toEqual({ topic, found: [] });
      }
    });
  });
});
