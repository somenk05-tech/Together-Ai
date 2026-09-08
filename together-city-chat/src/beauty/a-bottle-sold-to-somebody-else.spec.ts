import { readFileSync } from 'fs';
import { join } from 'path';
import { BEAUTY_PRODUCTS, offeredTo, recommendProducts } from './beauty-engine';

/**
 * A BOTTLE SOLD TO SOMEBODY ELSE — owner, 6 Sep: "don't show female products
 * to male users."
 *
 * The Wash step of a man's body routine was Bella Vita's "Be the 'It' Girl"
 * shower-gel combo. The data sheet had graded that row Women all along; the
 * catalogue never carried the column, so the recommender could not read it.
 * `audience` carries it now — only where the sheet narrows, like `site` — and
 * recommendProducts() reads it through offeredTo(). Other or unsaid gender is
 * shown everything: a guess about who a bottle is for is not ours to make.
 */

describe('who a bottle is offered to', () => {
  it('keeps a women\'s product from a man, a men\'s product from a woman, and everything from nobody else', () => {
    const women = { audience: 'women' as const }, men = { audience: 'men' as const }, anyone = {};
    expect(offeredTo(women, 'Male')).toBe(false);
    expect(offeredTo(men, 'Male')).toBe(true);
    expect(offeredTo(anyone, 'Male')).toBe(true);
    expect(offeredTo(men, 'Female')).toBe(false);
    expect(offeredTo(women, 'Female')).toBe(true);
    for (const g of ['Other', '', undefined, null]) {
      expect(offeredTo(women, g)).toBe(true);
      expect(offeredTo(men, g)).toBe(true);
    }
    // The hub's own spelling and the Master Profile's both read.
    expect(offeredTo(women, 'male')).toBe(false);
  });
});

describe('the catalogue carries the sheet\'s column', () => {
  const sheet = JSON.parse(readFileSync(join(__dirname, '..', '..', 'scripts', 'beauty-sheet-2026-08.json'), 'utf8')) as { id: string; gender?: string }[];

  it('says Women or Men on exactly the rows the sheet does, and nothing on the rest', () => {
    const want = new Map(sheet.map((r) => [r.id, r.gender === 'Women' ? 'women' : r.gender === 'Men' ? 'men' : undefined]));
    const wrong = BEAUTY_PRODUCTS.filter((p) => want.has(p.id) && want.get(p.id) !== p.audience).map((p) => p.id);
    expect(wrong).toEqual([]);
    expect(BEAUTY_PRODUCTS.filter((p) => p.audience === 'women').length).toBeGreaterThan(200);
    expect(BEAUTY_PRODUCTS.filter((p) => p.audience === 'men').length).toBeGreaterThan(90);
  });

  it('names the shower gel that started this', () => {
    const it = BEAUTY_PRODUCTS.find((p) => p.id === 'bp_bella_vita_organic_be_the_it_girl_combo');
    expect(it?.audience).toBe('women');
  });
});

describe('the recommender', () => {
  const ask = (gender?: string) => recommendProducts({
    readings: [],
    concerns: [],
    profile: { skinType: 'normal', gender },
    insights: [],
  });

  it('never hands a man a women\'s product, nor a woman a men\'s', () => {
    const forHim = ask('Male');
    expect(forHim.length).toBeGreaterThan(100);
    expect(forHim.filter((p) => p.audience === 'women')).toEqual([]);
    expect(forHim.some((p) => p.audience === 'men')).toBe(true);
    const forHer = ask('Female');
    expect(forHer.filter((p) => p.audience === 'men')).toEqual([]);
    expect(forHer.some((p) => p.audience === 'women')).toBe(true);
  });

  it('shows everything to a citizen whose gender is Other or unsaid', () => {
    for (const g of ['Other', undefined]) {
      const all = ask(g);
      expect(all.some((p) => p.audience === 'women')).toBe(true);
      expect(all.some((p) => p.audience === 'men')).toBe(true);
    }
  });
});
