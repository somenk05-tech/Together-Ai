import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CATALOGUE } from '@/features/babycare/data/catalogue';
import { IMS_SUBS, NON_IMS_FEEDING_SUBS, isImsProduct, mayAdvertise, advertisable } from '@/features/babycare/ims';
import { essentialsFor, essentialPool } from '@/features/babycare/essentials';
import { keepsBand, searchShelf } from '@/features/babycare/api';
import { bandForDob, bandForMonths, monthsOld } from '@/features/babycare/age';
import { PriceLine } from '@/features/babycare/components/Marks';
import { ProductTile } from '@/features/babycare/components/ProductTile';
import { AISLES } from '@/features/babycare/aisles';
import type { BabyProduct } from '@/features/babycare/types';

/**
 * ══ THE STORE THAT MAY NOT ADVERTISE ════════════════════════════════════════
 *
 * India's IMS Act 1992 makes promoting infant formula, infant food, feeding
 * bottles and teats for under-twos a criminal offence carrying up to three
 * years' imprisonment. This file is what stops that from being a paragraph in
 * a comment that a later change walks past.
 *
 * It holds four things:
 *
 *  1 · THE CLASSIFICATION IS TOTAL. Every feeding row's subcategory is either
 *      named as restricted or named as deliberately cleared. A subcategory in
 *      neither list is treated as restricted at runtime — fail closed — and
 *      fails HERE, so nobody finds out from the silence.
 *  2 · THE BADGE CANNOT ESCAPE. PriceLine and ProductTile are rendered, and a
 *      restricted row's markup must contain no discount, no percentage and no
 *      struck-through MRP. Rendered rather than grepped, because the grep would
 *      pass on a component that computes the badge and hides it in CSS.
 *  3 · THE CURATED SURFACES ARE CLEAN. The essentials list is built from real
 *      data and must contain no restricted row and no gated row.
 *  4 · THE CATALOGUE'S OWN PROMISES HOLD — a source on every row, no invented
 *      price, no invented age, no inferred certification.
 *
 * It reads source with comments stripped where it reads source at all. This
 * repo has been caught five times by a guard that went green on a file's own
 * prose; `grocery-orders-removed.spec.ts` names the habit.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const draw = (el: React.ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, el));

const restricted = CATALOGUE.filter(isImsProduct);
const open = CATALOGUE.filter(mayAdvertise);

describe('the classification is total, and unknown fails closed', () => {
  it('every feeding row is named restricted or named cleared — never merely unlisted', () => {
    const named = new Set([...IMS_SUBS, ...NON_IMS_FEEDING_SUBS]);
    const unnamed = [...new Set(
      CATALOGUE.filter((p) => p.aisle === 'feeding').map((p) => p.sub).filter((s) => !named.has(s)),
    )];
    expect(unnamed).toEqual([]);
  });

  it('the two lists do not overlap', () => {
    const both = IMS_SUBS.filter((s) => NON_IMS_FEEDING_SUBS.includes(s));
    expect(both).toEqual([]);
  });

  it('an unheard-of feeding subcategory is refused rather than allowed', () => {
    const invented = { ...CATALOGUE[0], aisle: 'feeding', sub: 'Something nobody classified' } as BabyProduct;
    expect(isImsProduct(invented)).toBe(true);
    expect(mayAdvertise(invented)).toBe(false);
  });

  it('nothing outside the feeding aisle is swept in by a coincidence of wording', () => {
    const strays = CATALOGUE.filter((p) => p.aisle !== 'feeding' && isImsProduct(p));
    expect(strays).toEqual([]);
  });

  it('the catalogue actually holds restricted rows, so these assertions have reached data', () => {
    // A guard is only proven where the data has reached — the share cap read as
    // correct for a month because no category ever tripped it.
    expect(restricted.length).toBeGreaterThan(20);
    expect(restricted.some((p) => p.sub === 'Infant formula')).toBe(true);
    expect(restricted.some((p) => p.sub === 'Feeding bottle')).toBe(true);
    expect(restricted.some((p) => p.sub === 'Infant cereal')).toBe(true);
  });

  it('the growing-up drink for two-to-five year olds is NOT restricted', () => {
    // The statute's scope ends at two, and the seller's own page sells this for
    // 2-5. If this ever flips, the reasoning in ims.ts has been edited away.
    const nangrow = CATALOGUE.find((p) => p.id === 'nangrow');
    expect(nangrow && isImsProduct(nangrow)).toBe(false);
  });

  it('breast pumps and sterilisers are not restricted — the Act’s subject is the substitute', () => {
    for (const sub of ['Breast pump', 'Steriliser', 'Milk storage', 'Nursing pads']) {
      const rows = CATALOGUE.filter((p) => p.sub === sub);
      expect({ sub, restricted: rows.filter(isImsProduct).length }).toEqual({ sub, restricted: 0 });
    }
  });
});

describe('a restricted row cannot be badged, ranked or bundled', () => {
  it('PriceLine draws no discount, no percentage and no struck-through MRP', () => {
    /* THE ROW IS BUILT RATHER THAN FOUND, and that is this repo's own scar:
       "a guard is only proven where the data has reached". No restricted row in
       today's catalogue happens to carry an MRP above its selling price — the
       formula listings print one number — so a loop over the catalogue would
       pass by iterating nothing, and would go on passing on the day somebody
       adds a discounted tin. The temptation is constructed here so the
       mechanism is tested whatever the data does, and every real restricted row
       is swept below it.
       (Written this way BECAUSE the first version of this test did loop over
       the catalogue, and reported zero rows to check.) */
    const built = { ...restricted[0], priceInr: 700, mrpInr: 999 } as BabyProduct;
    const flash = draw(createElement(PriceLine, { product: built, mayBadge: mayAdvertise(built) }));
    expect(/% off/i.test(flash)).toBe(false);
    expect(/line-through/.test(flash)).toBe(false);
    expect(flash.includes('999')).toBe(false);
    expect(flash.includes('700')).toBe(true);

    const temptations = restricted.filter((p) => p.mrpInr !== null && p.priceInr !== null && p.mrpInr > p.priceInr);
    for (const p of temptations) {
      const html = draw(createElement(PriceLine, { product: p, mayBadge: mayAdvertise(p) }));
      expect({ id: p.id, off: /% off/i.test(html) }).toEqual({ id: p.id, off: false });
      expect({ id: p.id, strike: /line-through/.test(html) }).toEqual({ id: p.id, strike: false });
      expect({ id: p.id, mrp: html.includes(p.mrpInr!.toLocaleString('en-IN')) })
        .toEqual({ id: p.id, mrp: false });
    }
  });

  it('an unrestricted row with an MRP still shows its discount — the rule is not "never badge"', () => {
    const ok = open.find((p) => p.mrpInr !== null && p.priceInr !== null && p.mrpInr > p.priceInr);
    expect(ok).toBeTruthy();
    const html = draw(createElement(PriceLine, { product: ok!, mayBadge: true }));
    expect(/% off/i.test(html)).toBe(true);
  });

  it('the tile itself never badges a restricted row', () => {
    // Built for the same reason as above, and swept over the real rows after.
    const built = { ...restricted[0], priceInr: 700, mrpInr: 999 } as BabyProduct;
    expect(/% off/i.test(draw(createElement(ProductTile, { product: built })))).toBe(false);
    for (const p of restricted.filter((x) => x.mrpInr !== null && x.priceInr !== null && x.mrpInr > x.priceInr)) {
      const html = draw(createElement(ProductTile, { product: p }));
      expect({ id: p.id, off: /% off/i.test(html) }).toEqual({ id: p.id, off: false });
    }
  });

  it('PriceLine has no default for mayBadge — a caller must answer the question', () => {
    const src = strip(read('features/babycare/components/Marks.tsx'));
    expect(src).toMatch(/mayBadge:\s*boolean/);
    expect(src).not.toMatch(/mayBadge\s*=\s*true/);
  });

  it('the tile carries no reason line — a reason on a tin of formula is a recommendation', () => {
    const src = strip(read('features/babycare/components/ProductTile.tsx'));
    expect(src).not.toMatch(/\breason\b/);
  });

  it('the shelf sorts by price or by kind and by nothing that could rank', () => {
    const src = strip(read('features/babycare/api.ts'));
    for (const word of ['relevance', 'bestseller', 'popular', 'trending', 'recommended', 'score']) {
      expect({ word, present: src.toLowerCase().includes(word) }).toEqual({ word, present: false });
    }
  });

  it('the product page offers no cross-sell', () => {
    const src = strip(read('features/babycare/pages/ProductPage.tsx'));
    for (const word of ['also bought', 'similar', 'you may like', 'related']) {
      expect({ word, present: src.toLowerCase().includes(word) }).toEqual({ word, present: false });
    }
  });
});

describe('the curated surfaces are built from cleared rows only', () => {
  it('no essentials line, at any band, is a restricted or gated product', () => {
    for (const band of ['0-6m', '6-12m', '1-2y', '2-4y', '4-7y', '7-10y'] as const) {
      const pool = essentialPool(band);
      expect({ band, restricted: pool.filter(isImsProduct).length }).toEqual({ band, restricted: 0 });
      expect({ band, gated: pool.filter((p) => p.gate !== null).length }).toEqual({ band, gated: 0 });
      // and the room actually produces something, so this has reached data
      expect(essentialsFor(band).length).toBeGreaterThan(0);
    }
  });

  it('advertisable() removes exactly the restricted rows and nothing else', () => {
    expect(advertisable(CATALOGUE).length).toBe(CATALOGUE.length - restricted.length);
  });
});

describe('the catalogue keeps its own four promises', () => {
  it('every row carries a source page, and every source is https', () => {
    const bad = CATALOGUE.filter((p) => !p.source.startsWith('https://'));
    expect(bad.map((p) => p.id)).toEqual([]);
  });

  it('every id is unique', () => {
    expect(new Set(CATALOGUE.map((p) => p.id)).size).toBe(CATALOGUE.length);
  });

  it('every row names an aisle the district actually has', () => {
    const known = new Set(AISLES.map((a) => a.key));
    expect(CATALOGUE.filter((p) => !known.has(p.aisle)).map((p) => p.id)).toEqual([]);
  });

  it('a row with no confirmed price says so rather than showing a number', () => {
    const unpriced = CATALOGUE.filter((p) => p.priceInr === null);
    expect(unpriced.length).toBeGreaterThan(0);
    for (const p of unpriced) {
      const html = draw(createElement(PriceLine, { product: p, mayBadge: mayAdvertise(p) }));
      expect({ id: p.id, said: html.includes('Price not verified at source') })
        .toEqual({ id: p.id, said: true });
    }
  });

  it('an MRP never sits below the price it is struck through against', () => {
    const upside = CATALOGUE.filter((p) => p.mrpInr !== null && p.priceInr !== null && p.mrpInr < p.priceInr);
    expect(upside.map((p) => p.id)).toEqual([]);
  });

  it('no row invents an age the seller did not print', () => {
    // Bands without the seller's own words behind them would be this catalogue
    // deciding an age. Every banded row carries what the page said.
    const invented = CATALOGUE.filter((p) => p.bands.length > 0 && !p.ageSaid);
    expect(invented.map((p) => p.id)).toEqual([]);
  });

  it('a certification is only ever quoted, and only on the products whose pages carried one', () => {
    const certified = CATALOGUE.filter((p) => p.cert !== null);
    expect(certified.length).toBeGreaterThan(0);
    // Nothing in this catalogue claims a BIS or ISI mark: no page printed one.
    expect(certified.filter((p) => /\bBIS\b|\bISI\b/i.test(p.cert ?? '')).map((p) => p.id)).toEqual([]);
  });
});

describe('the age filter never drops a row on a seller’s silence', () => {
  it('a row with no bands survives every band', () => {
    const ageless = CATALOGUE.find((p) => p.bands.length === 0)!;
    for (const band of ['0-6m', '2-4y', '7-10y'] as const) expect(keepsBand(ageless, band)).toBe(true);
  });

  it('a banded row is kept for its own bands and dropped for the others', () => {
    const banded = CATALOGUE.find((p) => p.bands.length === 1)!;
    expect(keepsBand(banded, banded.bands[0])).toBe(true);
    const other = (['0-6m', '7-10y'] as const).find((b) => b !== banded.bands[0])!;
    expect(keepsBand(banded, other)).toBe(false);
  });

  it('an unpriced row sorts last in both directions, never as free', () => {
    const low = searchShelf({ sort: 'low' });
    const high = searchShelf({ sort: 'high' });
    expect(low[low.length - 1].priceInr).toBeNull();
    expect(high[high.length - 1].priceInr).toBeNull();
    expect(low[0].priceInr).not.toBeNull();
  });
});

describe('an age is derived from a birthday, by the calendar', () => {
  const on = (s: string) => new Date(`${s}T00:00:00Z`);

  it('counts whole months the way a parent counts them', () => {
    expect(monthsOld('2026-01-14', on('2026-04-13'))).toBe(2);
    expect(monthsOld('2026-01-14', on('2026-04-14'))).toBe(3);
    // 31 January is one month old on 28 February — only the calendar knows this
    expect(monthsOld('2026-01-31', on('2026-02-28'))).toBe(0);
    expect(monthsOld('2026-01-31', on('2026-03-31'))).toBe(2);
  });

  it('refuses a date that does not exist, and a birthday still to come', () => {
    expect(monthsOld('2026-02-31', on('2026-09-08'))).toBeNull();
    expect(monthsOld('2027-01-01', on('2026-09-08'))).toBeNull();
    expect(bandForDob('2027-01-01', on('2026-09-08'))).toBeNull();
  });

  it('puts each month in exactly one band, and lets a child leave at ten', () => {
    expect(bandForMonths(0)).toBe('0-6m');
    expect(bandForMonths(5)).toBe('0-6m');
    expect(bandForMonths(6)).toBe('6-12m');
    expect(bandForMonths(11)).toBe('6-12m');
    expect(bandForMonths(12)).toBe('1-2y');
    expect(bandForMonths(23)).toBe('1-2y');
    expect(bandForMonths(24)).toBe('2-4y');
    expect(bandForMonths(47)).toBe('2-4y');
    expect(bandForMonths(48)).toBe('4-7y');
    expect(bandForMonths(83)).toBe('4-7y');
    expect(bandForMonths(84)).toBe('7-10y');
    expect(bandForMonths(119)).toBe('7-10y');
    expect(bandForMonths(120)).toBeNull();
  });
});

describe('the shop names what it read, on every room that changes with the child', () => {
  for (const page of ['pages/Shop.tsx', 'pages/Essentials.tsx']) {
    it(`${page} draws the child bar`, () => {
      expect(strip(read(`features/babycare/${page}`))).toMatch(/<ChildBar\s*\/>/);
    });
  }

  it('the child’s notes are read by nothing', () => {
    // The promise the form makes to the parent, held where it could be broken:
    // no shelf, checklist or filter may consult the free-text box.
    for (const f of ['api.ts', 'essentials.ts', 'ims.ts', 'pages/Shop.tsx', 'pages/Essentials.tsx']) {
      const src = strip(read(`features/babycare/${f}`));
      expect({ f, reads: /\.notes\b/.test(src) }).toEqual({ f, reads: false });
    }
  });
});
