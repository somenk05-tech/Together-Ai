import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BUSINESS_TYPES, typesForGroup, sectionsFor, cleanDetails, readDetails,
  businessType, isBusinessType, CATALOGUES, catalogueFor,
} from './business-types';
import { CATEGORY_GROUPS } from './categories';

/**
 * THE SCHEMA IS THE PRODUCT, SO THE SCHEMA IS WHAT GETS CHECKED.
 *
 * Every screen in this hub is generated from business-types.ts. That is the
 * whole point of it, and it is also the risk: a typo in a field key is not a
 * compile error, it is a question the owner answers and the page never shows.
 * The database cannot check a JSON column, so this file does.
 */
describe('the schema every screen is generated from', () => {
  it('has no duplicate type keys, and every type belongs to a real group', () => {
    const keys = BUSINESS_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const groups = [...CATEGORY_GROUPS, 'Other'];
    const orphans = BUSINESS_TYPES.filter((t) => !groups.includes(t.group)).map((t) => `${t.key} → ${t.group}`);
    expect(orphans).toEqual([]);
  });

  it('has no duplicate field key inside a type', () => {
    const offenders = BUSINESS_TYPES
      .filter((t) => new Set(t.fields.map((f) => f.key)).size !== t.fields.length)
      .map((t) => t.key);
    expect(offenders).toEqual([]);
  });

  it('gives every chips field its options and every other field none', () => {
    const bad: string[] = [];
    for (const t of BUSINESS_TYPES) {
      for (const f of t.fields) {
        const needsOptions = f.kind === 'chips' || f.kind === 'select';
        if (needsOptions && !f.options?.length) bad.push(`${t.key}.${f.key} has no options`);
        if (!needsOptions && f.options) bad.push(`${t.key}.${f.key} has options it cannot show`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('leaves every group with something to choose', () => {
    // A group whose types list is empty would show an owner an empty select and
    // no way past it.
    for (const g of CATEGORY_GROUPS) {
      expect(typesForGroup(g).length).toBeGreaterThan(0);
    }
  });

  it('always offers the general type last, so nothing is unlistable', () => {
    for (const g of CATEGORY_GROUPS) {
      const types = typesForGroup(g);
      expect(types[types.length - 1].key).toBe('general');
    }
  });

  it('gives every type the sections that are not optional', () => {
    // About, reviews and location are how a citizen decides anything. A type
    // that dropped them would render a page with a name and nothing else.
    for (const t of BUSINESS_TYPES) {
      for (const s of ['about', 'reviews', 'location'] as const) {
        expect(t.sections).toContain(s);
      }
    }
  });

  it('never gives one type both a menu and a price list', () => {
    // They are the same table with two vocabularies. A page carrying both asks
    // the owner to keep two lists and the citizen to read two.
    const both = BUSINESS_TYPES
      .filter((t) => t.sections.includes('menu') && t.sections.includes('priceList'))
      .map((t) => t.key);
    expect(both).toEqual([]);
  });
});

describe('what the server will actually store', () => {
  it('drops anything the type did not ask for', () => {
    // detailsJson is not a bag. A key nobody declared is a key nobody renders,
    // and the first thing that gets put in an undeclared field is a script tag.
    const out = cleanDetails('salon', { stylists: 4, cuisines: ['Thai'], evil: '<script>' });
    expect(out).toEqual({ stylists: 4 });
  });

  it('drops chip values that are not on the list', () => {
    const out = cleanDetails('restaurant', { cuisines: ['South Indian', 'Klingon'] });
    expect(out.cuisines).toEqual(['South Indian']);
  });

  it('stores a toggle only when it is true', () => {
    // "No" is the absence of a claim, not a claim of absence. Storing false
    // would print "Emergency call-outs: No" on somebody's shopfront.
    expect(cleanDetails('trade', { emergency: true })).toEqual({ emergency: true });
    expect(cleanDetails('trade', { emergency: false })).toEqual({});
  });

  it('refuses a number outside what the field could mean', () => {
    expect(cleanDetails('trade', { years: 900 })).toEqual({});
    expect(cleanDetails('trade', { years: 12 })).toEqual({ years: 12 });
    expect(cleanDetails('salon', { stylists: 0 })).toEqual({});
  });

  it('stores nothing at all for a type it does not know', () => {
    expect(cleanDetails('sorcery', { anything: 'goes' })).toEqual({});
    expect(cleanDetails(null, { anything: 'goes' })).toEqual({});
    expect(isBusinessType('sorcery')).toBe(false);
  });

  it('reads back only what was stored, with the label the owner saw', () => {
    const lines = readDetails('clinic', { speciality: 'Dentistry', consultFee: 600, modes: ['In clinic'] });
    expect(lines).toEqual([
      { label: 'Speciality', value: 'Dentistry' },
      { label: 'Consultation fee', value: '₹600' },
      { label: 'How people are seen', value: 'In clinic' },
    ]);
  });

  it('a restaurant is never asked what a plumber is asked, and the reverse', () => {
    // The whole philosophy in one assertion.
    const restaurant = businessType('restaurant')?.fields.map((f) => f.key) ?? [];
    const trade = businessType('trade')?.fields.map((f) => f.key) ?? [];
    expect(restaurant).toContain('cuisines');
    expect(trade).not.toContain('cuisines');
    expect(trade).toContain('emergency');
    expect(restaurant).not.toContain('emergency');
  });

  it('sections fall back rather than throwing on an unknown type', () => {
    expect(sectionsFor('sorcery')).toContain('about');
    expect(sectionsFor(null)).toContain('reviews');
  });
});

/**
 * The keys are an ON-DISK CONTRACT. Once a listing has answered `cuisines`,
 * renaming that key silently empties the answer for every restaurant in the
 * city — no error, no migration, just a page that used to say South Indian and
 * now says nothing. This pins the ones already shipped.
 */
describe('field keys are frozen once they ship', () => {
  it('still declares every key a listing may already hold', () => {
    const shipped: Record<string, string[]> = {
      restaurant: ['cuisines', 'diet', 'seats', 'dining', 'costForTwo'],
      salon: ['treatments', 'stylists', 'appointmentOnly', 'homeVisit'],
      clinic: ['speciality', 'qualifications', 'regNumber', 'years', 'consultFee', 'modes'],
      trade: ['work', 'emergency', 'openToday', 'visitFee', 'years'],
    };
    for (const [type, keys] of Object.entries(shipped)) {
      const live = businessType(type)?.fields.map((f) => f.key) ?? [];
      const missing = keys.filter((k) => !live.includes(k));
      expect(missing).toEqual([]);
    }
  });

  it('says out loud, in the file, that keys are frozen', () => {
    // A rule nobody can find is a rule that gets broken by the next person.
    const src = readFileSync(join(__dirname, 'business-types.ts'), 'utf8');
    expect(src).toMatch(/Frozen once shipped/);
  });
});

/**
 * ── EVERY KIND OF BUSINESS PUBLISHES SOMETHING, AND SAYS HOW (owner, 8 Sep) ──
 *
 * "If it's a restaurant have menu scanning ability; if it's a grocery store,
 * let them update material list, upload files; similarly for every other
 * vendor a different style of web page." The catalogue is the one answer
 * every screen reads; these hold it to the owner's three sentences.
 */
describe('the catalogue each kind of business publishes', () => {
  it('names one for every type, and every one names its words and its doors', () => {
    for (const t of BUSINESS_TYPES) {
      const c = CATALOGUES[t.catalogue];
      expect({ type: t.key, has: Boolean(c) }).toEqual({ type: t.key, has: true });
      expect(c.title.length).toBeGreaterThan(2);
      expect(c.noun.length).toBeGreaterThan(2);
      expect(c.ways.length).toBeGreaterThan(0);
      expect(new Set(c.ways).size).toBe(c.ways.length);
    }
  });

  it('a restaurant leads with the photograph; a grocery leads with the sheet', () => {
    expect(catalogueFor('restaurant', 'restaurants', 'Food & Daily Needs').ways[0]).toBe('photo');
    expect(catalogueFor('restaurant', null, null).kind).toBe('menu');
    expect(catalogueFor('grocery', 'grocery_stores', 'Food & Daily Needs').ways[0]).toBe('sheet');
    expect(catalogueFor('grocery', null, null).kind).toBe('stock');
    // and both are the orderable kind — a cart, a wallet, a delivery
    expect(catalogueFor('restaurant', null, null).orderable).toBe(true);
    expect(catalogueFor('grocery', null, null).orderable).toBe(true);
  });

  it('gives every other vendor its own words', () => {
    expect(catalogueFor('salon', null, null).kind).toBe('rateCard');
    expect(catalogueFor('creative', null, null).kind).toBe('packages');
    expect(catalogueFor('transport', null, null).kind).toBe('fares');
    expect(catalogueFor('retail', null, null).kind).toBe('stock');
    // and none of them takes a cart — a haircut × 2 is the app misunderstanding a salon
    for (const k of ['salon', 'creative', 'transport', 'clinic', 'trade']) {
      expect(catalogueFor(k, null, null).orderable).toBe(false);
    }
  });

  it('reads the trade when the type is missing or "something else" — and never over a real type', () => {
    // A kirana that was listed before the grocery type existed
    expect(catalogueFor(null, 'grocery_stores', 'Food & Daily Needs').kind).toBe('stock');
    expect(catalogueFor('general', 'supermarkets', 'Food & Daily Needs').kind).toBe('stock');
    expect(catalogueFor(null, 'restaurants', 'Food & Daily Needs').kind).toBe('menu');
    expect(catalogueFor(null, 'taxi_stands', 'Automotive').kind).toBe('fares');
    expect(catalogueFor(null, 'plumbers', 'Home Services').kind).toBe('rateCard');
    expect(catalogueFor('general', 'plumbers', 'Home Services').kind).toBe('none');
    // a restaurant filed under a grocery trade is still a menu
    expect(catalogueFor('restaurant', 'grocery_stores', 'Food & Daily Needs').kind).toBe('menu');
  });

  it('offers the grocery type where a grocer is filed, beside the kitchens', () => {
    const keys = typesForGroup('Food & Daily Needs').map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['restaurant', 'cafe', 'bakery', 'grocery']));
    expect(keys[keys.length - 1]).toBe('general');
  });
});
