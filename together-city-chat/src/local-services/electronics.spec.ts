import { readFileSync } from 'fs';
import { join } from 'path';
import { AISLES, ELECTRONICS_CATEGORIES, aisleOf, aisleRank, isElectronicsCategory, sectionAisle } from './electronics';
import { SERVICE_CATEGORIES } from './categories';
import { catalogueFor } from './business-types';

/**
 * THE ELECTRONICS STORE'S ONE RULE, HELD FROM BOTH ENDS — the grocery shelf's
 * rule, held again: the aisle is decided by what the shopkeeper WROTE and what
 * trade they registered under, never by what the product appears to be.
 */
describe('the trades that sell electronics', () => {
  it('are all real categories, and all in Shopping', () => {
    for (const key of ELECTRONICS_CATEGORIES) {
      const cat = SERVICE_CATEGORIES.find((c) => c.key === key);
      expect({ key, found: !!cat }).toEqual({ key, found: true });
      expect({ key, group: cat?.group }).toEqual({ key, group: 'Shopping' });
    }
  });

  /* THE SHELF ONLY EXISTS BECAUSE THESE SHOPS ALREADY PUBLISH STOCK. If the
     Shopping group ever stopped getting a stock list, this shelf would be
     reading a publishing surface that no longer exists — so the assumption is
     asserted rather than assumed. */
  it('publish a stock list, which is what this shelf reads', () => {
    for (const key of ELECTRONICS_CATEGORIES) {
      expect({ key, kind: catalogueFor(null, key, 'Shopping').kind }).toEqual({ key, kind: 'stock' });
    }
  });

  it('leaves repair trades out — a call-out charge is not a product', () => {
    for (const key of ['appliance_repair', 'ac_repair', 'electricians']) {
      expect({ key, in: isElectronicsCategory(key) }).toEqual({ key, in: false });
    }
  });
});

describe('the aisles', () => {
  it('end with Everything else, always', () => {
    expect(AISLES[AISLES.length - 1].key).toBe('other');
    for (const a of AISLES) expect(aisleRank(a.key)).toBeLessThan(AISLES.length);
    expect(aisleRank('nonsense')).toBe(AISLES.length);
  });

  it('have no repeated key', () => {
    expect(new Set(AISLES.map((a) => a.key)).size).toBe(AISLES.length);
  });
});

describe("the shopkeeper's own heading decides the aisle", () => {
  const cases: [string, string][] = [
    ['Mobiles', 'phones'],
    ['Smartphones & Tablets', 'phones'],
    ['Laptops', 'computers'],
    ['Printers', 'computers'],
    ['WiFi Routers', 'computers'],
    ['LED TV', 'tv'],
    ['Home Theatre', 'tv'],
    ['Speakers', 'audio'],
    ['Earphones & Headphones', 'audio'],
    ['Washing Machines', 'appliances'],
    ['Water Purifier', 'appliances'],
    ['Mixer Grinder', 'kitchen'],
    ['Kitchen Appliances', 'kitchen'],
    ['Ceiling Fans', 'cooling'],
    ['Air Conditioners', 'cooling'],
    ['Inverter & Battery', 'power'],
    ['Power Banks', 'power'],
    ['Chargers', 'accessories'],
    ['Mobile Accessories', 'accessories'],
  ];
  for (const [section, aisle] of cases) {
    it(`files "${section}" under ${aisle}`, () => {
      expect(sectionAisle(section)).toBe(aisle);
    });
  }

  /* THE THREE ORDERINGS THAT ARE NOT ALPHABETICAL AND MUST NOT BECOME SO —
     the same class of trap as grocery's "vegetable oil". */
  it('does not read a phone accessory as a phone', () => {
    expect(sectionAisle('Mobile Accessories')).toBe('accessories');
    expect(sectionAisle('Phone Covers')).toBe('accessories');
    expect(sectionAisle('Mobile Chargers')).toBe('accessories');
  });

  it('does not read a kitchen appliance as a white good', () => {
    expect(sectionAisle('Kitchen Appliances')).toBe('kitchen');
  });

  it('keeps a white-goods heading that also names cooling out of the fan aisle', () => {
    expect(sectionAisle('Fridge, Washing Machine & AC')).toBe('appliances');
    // Cooling alone still reaches cooling — no other group carries these words.
    expect(sectionAisle('AC')).toBe('cooling');
    expect(sectionAisle('Coolers')).toBe('cooling');
  });

  it('says nothing when it does not know the word', () => {
    expect(sectionAisle('Weekly specials')).toBeNull();
    expect(sectionAisle('')).toBeNull();
    expect(sectionAisle(null)).toBeNull();
  });
});

describe('the trade decides when the shopkeeper wrote no heading', () => {
  it('files a mobile shop under phones', () => {
    expect(aisleOf(null, 'mobile_shops')).toBe('phones');
  });

  it('says nothing about a general electronics store, because its trade says nothing', () => {
    expect(aisleOf(null, 'electronics_stores')).toBe('other');
  });

  it('lets the heading beat the trade', () => {
    // A mobile shop that also sells speakers, and said so.
    expect(aisleOf('Speakers', 'mobile_shops')).toBe('audio');
  });
});

describe('nothing is ever dropped', () => {
  it('gives an unknown heading from an unknown trade a place to stand', () => {
    expect(aisleOf('Weekly specials', 'electronics_stores')).toBe('other');
    expect(AISLES.find((a) => a.key === 'other')?.label).toBe('Everything else');
  });

  /* THE ROW'S NAME IS NEVER READ. Comments stripped first, for the reason
     grocery.spec.ts gives: a check that reads its own explanation goes green
     when somebody rewords a sentence. */
  it('decides nothing from the product name', () => {
    const raw = readFileSync(join(__dirname, 'electronics.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');
    expect(code).not.toMatch(/\bname\b/);
  });
});
