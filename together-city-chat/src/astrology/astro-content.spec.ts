import { natalChart, scanMonth } from './astro-engine';
import { composeAnswer, composeGuidance, composeMonthly, wordCount } from './astro-content';
import { computeNumerology, vimshottariDasha } from './personal-factors';
import { violations } from './voice';

const born1 = new Date('1991-06-10T00:00:00Z');
const born2 = new Date('1985-12-02T00:00:00Z');
const chart = natalChart(born1, '09:45', 'Asia/Kolkata', 12.97, 77.59);
const chart2 = natalChart(born2, '22:10', 'Asia/Kolkata', 28.61, 77.21);

const guidanceOn = (c: typeof chart, born: Date, seed: string, day: Date, name?: string) =>
  composeGuidance(c, seed, day, computeNumerology(born, day), vimshottariDasha(c.moon.lon, born, day), name);

const monthlyOn = (c: typeof chart, born: Date, seed: string, month: number, name?: string) => {
  const on = new Date(`2026-${String(month).padStart(2, '0')}-05T00:00:00Z`);
  return composeMonthly(c, seed, scanMonth(c, 2026, month), computeNumerology(born, on), vimshottariDasha(c.moon.lon, born, on), name);
};

describe('astro-content', () => {
  it('daily guidance is dated, personalised and deterministic per user+day', () => {
    const day = new Date('2026-07-22T09:00:00Z');
    const a = guidanceOn(chart, born1, 'user-1', day);
    expect(a.date).toBe('2026-07-22');
    expect(a.sections).toHaveLength(5);
    // Same user+day → identical; different user → different text
    expect(guidanceOn(chart, born1, 'user-1', day).text).toBe(a.text);
    expect(guidanceOn(chart2, born2, 'user-2', day).text).not.toBe(a.text);
  });

  it('daily guidance varies across days for the same user', () => {
    const a = guidanceOn(chart, born1, 'user-1', new Date('2026-07-22T09:00:00Z'));
    const b = guidanceOn(chart, born1, 'user-1', new Date('2026-07-23T09:00:00Z'));
    expect(a.text).not.toBe(b.text);
  });

  it('every report opens as a letter, and copes with a missing name', () => {
    const day = new Date('2026-07-22T09:00:00Z');
    expect(guidanceOn(chart, born1, 'user-1', day, 'Somen Kumar').greeting).toBe('Dear Somen,');
    expect(guidanceOn(chart, born1, 'user-1', day).greeting).toBe('Dear friend,');
    expect(monthlyOn(chart, born1, 'user-1', 7, 'Priya').greeting).toBe('Dear Priya,');
  });

  it('monthly guidance hits the premium 2,000-4,000 word target with all 11 sections', () => {
    const astro = scanMonth(chart, 2026, 7);
    const m = composeMonthly(chart, 'user-1', astro);
    expect(m.words).toBeGreaterThanOrEqual(2000);
    expect(m.words).toBeLessThanOrEqual(4000);
    const keys = m.sections.map((s) => s.key);
    for (const k of ['intro', 'career', 'money', 'love', 'health', 'family', 'travel', 'events', 'best', 'caution', 'summary']) {
      expect(keys).toContain(k);
    }
    // Deterministic within the month
    expect(composeMonthly(chart, 'user-1', astro).sections[1].body).toBe(m.sections[1].body);
    // Personalised: another chart/user reads differently
    expect(composeMonthly(chart2, 'user-2', scanMonth(chart2, 2026, 7)).sections[1].body).not.toBe(m.sections[1].body);
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
   * The voice guarantee — the reason voice.ts exists.
   *
   * Swept across two charts, several dates and every topic rather than checked
   * once, because the composers pick from pools and branch on sign, element and
   * retrograde state. A single sample can pass while a branch nobody exercised
   * still says "Mercury retrograde in Gemini". The two charts have different
   * suns, moons and ascendants, so between them they reach most of the
   * sign-dependent phrasing.
   */
  describe('never exposes the machinery', () => {
    const days = ['2026-01-14', '2026-03-02', '2026-07-22', '2026-09-30', '2026-12-11'].map((d) => new Date(`${d}T09:00:00Z`));

    it('daily guidance stays in voice across charts and dates', () => {
      for (const [c, born] of [[chart, born1], [chart2, born2]] as const) {
        for (const day of days) {
          const g = guidanceOn(c, born, 'seed-user', day, 'Somen');
          const text = [g.greeting, g.framing, g.theme, g.reflection, ...g.sections.map((s) => s.body)].join('\n');
          expect({ day: g.date, found: violations(text) }).toEqual({ day: g.date, found: [] });
        }
      }
    });

    it('monthly guidance stays in voice across charts and months', () => {
      for (const [c, born] of [[chart, born1], [chart2, born2]] as const) {
        for (const month of [1, 4, 7, 11]) {
          const m = monthlyOn(c, born, 'seed-user', month, 'Somen');
          const text = [m.greeting, m.title, m.framing ?? '', ...m.sections.map((s) => s.body)].join('\n');
          expect({ month: m.month, found: violations(text) }).toEqual({ month: m.month, found: [] });
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
