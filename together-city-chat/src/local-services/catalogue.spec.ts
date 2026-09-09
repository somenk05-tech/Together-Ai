import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CATALOGUE_SOURCES, SHOPS_PER_PRODUCT,
  citation, isCatalogueSource, searchTerms, searchTextFor,
} from './catalogue';
import { AISLES } from './grocery';

/**
 * ── THE ONE INVARIANT THIS TABLE EXISTS TO KEEP ─────────────────────────────
 *
 * The catalogue says what a product IS. A shopkeeper says what it COSTS. On
 * 2 August this hub shipped the other arrangement — retailers' names over
 * simulated prices — and `grocery-orders-removed.spec.ts` is the apology that
 * still stands. These are the guards that stop it happening a second time
 * wearing open data as a costume.
 */
describe('the catalogue holds no prices', () => {
  /* READ WITH THE COMMENTS STRIPPED. This file's own prose says "price" in
     nearly every paragraph, on purpose, and a check that reads its own
     explanation goes green when somebody rewords a sentence and red when
     nobody has changed anything. That trap has cost this repo five times. */
  const stripped = (file: string) => readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

  it('names no price anywhere in catalogue.ts', () => {
    expect(stripped('catalogue.ts')).not.toMatch(/price|Inr|rupee|₹|mrp/i);
  });

  it('has no price column on the table', () => {
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model GroceryProduct {'));
    const body = model.slice(0, model.indexOf('\n}'))
      .split('\n').filter((l) => !l.trim().startsWith('///')).join('\n');
    expect(body).not.toMatch(/price|Inr|mrp/i);
  });

  it('reads no price out of any source extract', () => {
    const gen = readFileSync(join(__dirname, '..', '..', 'scripts', 'gen-grocery-catalogue.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');
    expect(gen).not.toMatch(/price|modal_price|min_price|max_price|mrp/i);
  });
});

/**
 * EVERY ROW CARRIES WHERE IT CAME FROM. A catalogue row without a source is
 * the city quietly claiming to know about a product, which is the only thing
 * this table must never be able to do.
 */
describe('provenance', () => {
  it('gives every source a name, a licence and a link', () => {
    for (const [key, s] of Object.entries(CATALOGUE_SOURCES)) {
      expect({ key, keyMatches: s.key === key }).toEqual({ key, keyMatches: true });
      expect(s.name.length).toBeGreaterThan(4);
      expect(s.licence.length).toBeGreaterThan(2);
      expect(s.url('8901030868702')).toMatch(/^https:\/\//);
    }
  });

  it('points a barcode row at the page that shows that barcode', () => {
    expect(citation('openfoodfacts', '8901030868702')?.url)
      .toBe('https://world.openfoodfacts.org/product/8901030868702');
    expect(citation('openbeautyfacts', '8901287100013')?.url)
      .toBe('https://world.openbeautyfacts.org/product/8901287100013');
  });

  it('points a loose row at the government list it was read out of', () => {
    expect(citation('agmarknet', '65')?.url).toBe('https://api.agmarknet.gov.in/v1/commodities');
    expect(citation('agmarknet', '65')?.name).toMatch(/Government of India/);
  });

  it('refuses to invent a citation for a source it does not know', () => {
    expect(citation('blinkit', '123')).toBeNull();
    expect(isCatalogueSource('blinkit')).toBe(false);
    expect(isCatalogueSource('openfoodfacts')).toBe(true);
  });

  /* NO RETAILER IS A SOURCE — the 2 August list, by name, kept out by a test
     rather than by everyone remembering. */
  it('names no retailer among the sources', () => {
    const all = JSON.stringify(CATALOGUE_SOURCES).toLowerCase();
    for (const shop of ['blinkit', 'zepto', 'instamart', 'bigbasket', 'jiomart', 'dmart', 'amazon', 'swiggy']) {
      expect({ shop, present: all.includes(shop) }).toEqual({ shop, present: false });
    }
  });
});

/**
 * THE AISLE IS A TRANSLATION BETWEEN TWO FILING SYSTEMS, never a reading of a
 * product's name — the rule `grocery.ts` keeps for shopkeepers' rows, kept one
 * step further back for the catalogue's. It is applied in the generator, which
 * is the only place the source's own category still exists, so it is held
 * there: the map is read out of the script itself.
 */
describe('the aisle comes from the source, not from the name', () => {
  const gen = readFileSync(join(__dirname, '..', '..', 'scripts', 'gen-grocery-catalogue.mjs'), 'utf8');
  const map = gen.slice(gen.indexOf('const GROUP_AISLE = {'));
  const entries = [...map.slice(0, map.indexOf('};')).matchAll(/'([^']+)':\s*'([a-z]+)'/g)]
    .map((m) => ({ group: m[1], aisle: m[2] }));

  it('maps every source group onto one of the shelf’s own aisles', () => {
    const keys = new Set(AISLES.map((a) => a.key));
    expect(entries.length).toBeGreaterThan(4);
    for (const e of entries) expect({ ...e, real: keys.has(e.aisle) }).toEqual({ ...e, real: true });
  });

  it('covers the groups a grocery actually sells', () => {
    const groups = new Set(entries.map((e) => e.group));
    for (const g of ['Vegetables', 'Fruits', 'Cereals', 'Pulses', 'Spices']) {
      expect({ g, mapped: groups.has(g) }).toEqual({ g, mapped: true });
    }
  });

  it('decides nothing from a product name — the map is keyed on the group alone', () => {
    const fn = gen.slice(gen.indexOf('function loose()'));
    const body = fn.slice(0, fn.indexOf('\n}'))
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');
    // The aisle is read out of GROUP_AISLE by group. Nothing inspects `name`
    // to decide it; `name` appears only as a field being copied through.
    expect(body).toMatch(/GROUP_AISLE\[group\]/);
    expect(body).not.toMatch(/name\.(includes|match|test|startsWith|toLowerCase)/);
  });
});

/**
 * SEARCH IS AN AND OF PREFIXES, and deliberately not clever. A picker that
 * helpfully widens a search is a picker that puts the wrong pack on somebody's
 * shelf under the right name, where the shop cannot see that it happened.
 */
describe('search', () => {
  it('splits on anything that is not a letter or a digit', () => {
    expect(searchTerms('Aashirvaad Atta — 5kg!')).toEqual(['aashirvaad', 'atta', '5kg']);
  });

  it('drops one-character noise and caps the terms', () => {
    expect(searchTerms('a b tea')).toEqual(['tea']);
    expect(searchTerms('one two three four five six seven eight')).toHaveLength(6);
  });

  it('is empty for a query with nothing in it, so the picker opens on an aisle', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms('!!!')).toEqual([]);
  });

  it('builds the haystack out of brand, name and pack, and nothing else', () => {
    expect(searchTextFor('Aashirvaad', 'Shudh Chakki Atta', '5 kg')).toBe('aashirvaad shudh chakki atta 5 kg');
    // A loose row has no brand and no pack, and must not gain a stray space.
    expect(searchTextFor(null, 'Bhindi(Ladies Finger)', null)).toBe('bhindi(ladies finger)');
  });
});

describe('one product tile', () => {
  it('caps how many shops it names', () => {
    expect(SHOPS_PER_PRODUCT).toBeGreaterThan(1);
    expect(SHOPS_PER_PRODUCT).toBeLessThanOrEqual(20);
  });
});

/**
 * THE GENERATED FILE IS THE ONE THE SEED READS, so its shape is part of the
 * contract and not an implementation detail of a script nobody runs twice.
 */
describe('the generated catalogue file', () => {
  const rows = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'prisma', 'data', 'grocery-catalogue.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;

  it('has rows, and every one of them names its source', () => {
    expect(rows.length).toBeGreaterThan(500);
    for (const r of rows) {
      expect(typeof r.sourceKey).toBe('string');
      expect(typeof r.sourceRef).toBe('string');
      expect(isCatalogueSource(r.sourceKey as string)).toBe(true);
      expect(String(r.sourceRef).length).toBeGreaterThan(0);
    }
  });

  it('carries no price field on any row', () => {
    for (const r of rows) {
      for (const k of Object.keys(r)) expect(k).not.toMatch(/price|inr|mrp/i);
    }
  });

  it('stands every row in one of the shelf\u2019s own aisles', () => {
    const keys = new Set(AISLES.map((a) => a.key));
    for (const r of rows) expect(keys.has(r.aisle as string)).toBe(true);
  });

  it('gives a packed row a barcode and a picture, and a loose row neither', () => {
    for (const r of rows) {
      if (r.loose) {
        expect(r.gtin).toBeNull();
        expect(r.brand).toBeNull();
        // A stock photo of somebody else's tomatoes is not this row's picture.
        expect(r.imageUrl).toBeNull();
      } else {
        expect(typeof r.gtin).toBe('string');
        expect(String(r.imageUrl)).toMatch(/^https:\/\/images\.open(food|beauty)facts\.org\//);
      }
    }
  });

  it('has no barcode twice — one pack is one tile', () => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.gtin) continue;
      expect(seen.has(r.gtin as string)).toBe(false);
      seen.add(r.gtin as string);
    }
  });

  it('keeps searchText in step with the fields it is built from', () => {
    for (const r of rows) {
      expect(r.searchText).toBe(searchTextFor(r.brand as string | null, r.name as string, r.pack as string | null));
    }
  });
});
