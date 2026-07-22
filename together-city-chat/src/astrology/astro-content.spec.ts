import { natalChart, scanMonth } from './astro-engine';
import { composeAnswer, composeDaily, composeMonthly, wordCount } from './astro-content';

const chart = natalChart(new Date('1991-06-10T00:00:00Z'), '09:45', 'Asia/Kolkata', 12.97, 77.59);
const chart2 = natalChart(new Date('1985-12-02T00:00:00Z'), '22:10', 'Asia/Kolkata', 28.61, 77.21);

describe('astro-content', () => {
  it('daily horoscope is 100-200 words, dated, and deterministic per user+day', () => {
    const day = new Date('2026-07-22T09:00:00Z');
    const a = composeDaily(chart, 'user-1', day);
    expect(a.words).toBeGreaterThanOrEqual(100);
    expect(a.words).toBeLessThanOrEqual(200);
    expect(a.date).toBe('2026-07-22');
    expect(a.sunSign).toBe('Gemini');
    // Same user+day → identical; different user → different text
    expect(composeDaily(chart, 'user-1', day).text).toBe(a.text);
    expect(composeDaily(chart2, 'user-2', day).text).not.toBe(a.text);
  });

  it('daily horoscope varies across days for the same user', () => {
    const a = composeDaily(chart, 'user-1', new Date('2026-07-22T09:00:00Z'));
    const b = composeDaily(chart, 'user-1', new Date('2026-07-23T09:00:00Z'));
    expect(a.text).not.toBe(b.text);
  });

  it('monthly horoscope hits the premium 2,000-4,000 word target with all 11 sections', () => {
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

  it('consultation answers are detailed (300+ words), on-topic and chart-aware', () => {
    const astro = scanMonth(chart, 2026, 7);
    const ans = composeAnswer(chart, 'user-1', 'Career', 'Should I change my job this year or wait for a promotion?', new Date('2026-07-22T09:00:00Z'), astro);
    expect(wordCount(ans)).toBeGreaterThanOrEqual(300);
    expect(ans).toContain('Gemini'); // reads the actual natal sun
    expect(ans.toLowerCase()).toContain('career');
    // Different topic reads differently
    const ans2 = composeAnswer(chart, 'user-1', 'Marriage', 'When is a good period for my wedding?', new Date('2026-07-22T09:00:00Z'), astro);
    expect(ans2).not.toBe(ans);
  });
});
