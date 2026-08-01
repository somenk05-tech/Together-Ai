import { RestaurantsService } from './restaurants.service';

/**
 * THE ALLERGY RULE REACHES EVERY SURFACE THAT PUTS FOOD IN FRONT OF SOMEBODY.
 *
 * Found 1 Aug while working K5.66 ("the allergy propagation is invisible").
 * It was worse than invisible. Of the seven restaurant reads that take a
 * userId and personalise by diet, exactly ONE — discover() — screened
 * allergens at all. browse(), topByLocality(), collections(), search(),
 * detail() and meal-match() did not.
 *
 * meal-match() is the one that matters most: it recommends a NAMED DISH to eat
 * right now, matched to the citizen's own meal plan, and it never once asked
 * what they are allergic to. allergens.ts's own header warns about exactly this
 * shape of miss — "this is a menu, so the miss puts a dish in front of somebody
 * rather than a serum".
 *
 * Every case below FAILED on 8bedc8a. Six of the seven surfaces let the peanut
 * through; the seventh let it through silently.
 *
 * ── THE POLICY THIS PINS ────────────────────────────────────────────────────
 * The unit of safety is the DISH, because nobody eats a restaurant. Measured
 * against the catalogue, hiding any venue with one offending dish removed HALF
 * of it for a milk declaration — a place that serves paneer also serves twelve
 * things that are not paneer.
 *
 *   · A DISH the city recommends is screened out, always. No exceptions.
 *   · A VENUE is hidden only when there is nothing on its menu they can eat.
 *   · Otherwise the venue is SHOWN and MARKED with how much of the menu is out,
 *     which is the proportion only they can weigh.
 *   · Anything the citizen named — a search, a restaurant's own page — is never
 *     hidden. Hiding a place they can see on the street would be the app lying
 *     about the world rather than protecting them from it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const dish = (name: string, over: Record<string, unknown> = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), name, desc: `${name}, freshly made`,
  priceInr: 220, diet: 'veg', section: 'Mains', bestseller: true, ...over,
});

const IDLI = {
  id: 'r-idli', name: 'Idli House', cuisine: 'south-indian', area: 'Indiranagar', city: 'Bengaluru',
  rating: 4.6, priceForTwoInr: 500, tagline: 'Steamed, soft, all day', openHours: '07:00 - 23:00',
  vegFriendly: true, heroUrl: 'h', menuJson: JSON.stringify([dish('Plain Idli'), dish('Masala Dosa')]),
};
/**
 * Moongphali is the peanut. A substring test for "peanut" never finds it.
 * ONE of two dishes — so this place is shown, and marked, not hidden.
 */
const CHAAT = {
  id: 'r-chaat', name: 'Chaat Corner', cuisine: 'street', area: 'Indiranagar', city: 'Bengaluru',
  rating: 4.5, priceForTwoInr: 400, tagline: 'Street classics', openHours: '11:00 - 23:00',
  vegFriendly: true, heroUrl: 'h', menuJson: JSON.stringify([dish('Sev Puri'), dish('Moongphali Chaat')]),
};
/** Nothing here a peanut-allergic citizen can eat — the one case worth hiding. */
const NUTBAR = {
  id: 'r-nutbar', name: 'The Groundnut Bar', cuisine: 'street', area: 'Indiranagar', city: 'Bengaluru',
  rating: 4.4, priceForTwoInr: 300, tagline: 'Peanut everything', openHours: '11:00 - 22:00',
  vegFriendly: true, heroUrl: 'h', menuJson: JSON.stringify([dish('Groundnut Chikki'), dish('Moongphali Ladoo')]),
};

function build(opts: { allergies?: string; catalogue?: unknown[] } = {}) {
  const s: any = Object.create(RestaurantsService.prototype);
  const rows = opts.catalogue ?? [IDLI, CHAAT, NUTBAR];
  s.prisma = {
    restaurant: {
      findMany: async () => rows,
      findUnique: async ({ where }: any) => rows.find((r: any) => r.id === where.id) ?? null,
    },
    foodPref: {
      findUnique: async () => ({
        userId: 'u1', diet: 'everything',
        extras: JSON.stringify({ allergies: opts.allergies ?? '' }),
      }),
    },
    medicalRecord: { findMany: async () => [] },
    mealPlan: { findFirst: async () => ({ id: 'p1' }) },
    meal: {
      findFirst: async () => ({
        skipped: false, slot: 'l',
        recipe: {
          name: 'Rajma Chawal', slot: 'l', kcal: 520, protein: 18, carbs: 78, fat: 12,
          country: 'India', diet: 'veg', gramsPerServing: 350, servings: 1,
        },
      }),
    },
    diningOrder: { groupBy: async () => [] },
    reservation: { groupBy: async () => [] },
  };
  s.places = { enabled: false, nearby: async () => [] };
  s.masterProfile = { get: async () => ({ foodAllergens: '' }) };
  s.logger = { warn() {}, log() {}, error() {} };
  return s;
}

const names = (list: any[]) => list.map((x) => x.name);

const markOn = (list: any[], name: string) => list.find((x) => x.name === name).allergen;

describe('a venue with nothing edible on it goes; the rest are marked, not hidden', () => {
  it('discover() drops the all-peanut bar, keeps the chaat place, marks it', async () => {
    const out = await build({ allergies: 'peanuts' }).discover('u1', {});
    expect(names(out.restaurants).sort()).toEqual(['Chaat Corner', 'Idli House']);
    expect(markOn(out.restaurants, 'Chaat Corner').label).toBe('1 dish here contains peanuts: Moongphali Chaat.');
    expect(markOn(out.restaurants, 'Idli House')).toBeNull();
    expect(out.allergyNotice?.removed).toBe(1);
    expect(out.allergyNotice?.terms).toEqual(['peanuts']);
    expect(out.allergyNotice?.sentence).toContain('peanuts');
  });

  it('topByLocality() — "Top 25 Near You" ranked a peanut bar for a peanut allergy', async () => {
    const out = await build({ allergies: 'peanuts' }).topByLocality('u1', {});
    expect(names(out.restaurants)).not.toContain('The Groundnut Bar');
    expect(markOn(out.restaurants, 'Chaat Corner')).toBeTruthy();
    expect(out.allergyNotice?.removed).toBe(1);
  });

  it('collections() — sixteen curated lists, none of them screened', async () => {
    const out = await build({ allergies: 'peanuts' }).collections('u1', {});
    const all = out.collections.flatMap((c: any) => names(c.items));
    expect(all).not.toContain('The Groundnut Bar');
    expect(all).toContain('Idli House');
    expect(out.allergyNotice?.removed).toBe(1);
  });

  it('browse() — the Discover page list', async () => {
    const out = await build({ allergies: 'peanuts' }).browse('u1', {});
    expect(names(out.restaurants)).not.toContain('The Groundnut Bar');
    expect(markOn(out.restaurants, 'Chaat Corner')).toBeTruthy();
    expect(out.allergyNotice?.removed).toBe(1);
  });

  it('a venue is NOT hidden for one bad dish — the half-the-catalogue lesson', async () => {
    const out = await build({ allergies: 'milk' }).browse('u1', {});
    // Idli House serves a Masala Dosa and nothing dairy-named; Chaat Corner is
    // untouched by milk. Nothing should vanish, and nothing should be claimed.
    expect(names(out.restaurants)).toContain('Idli House');
    expect(out.allergyNotice).toBeNull();
  });
});

describe('the dish is the unit of safety', () => {
  it('mealMatch() recommended named dishes with no allergen check at all', async () => {
    const out = await build({ allergies: 'peanuts' }).mealMatch('u1', {});
    const dishes = out.matches.map((m: any) => m.dishName);
    expect(dishes).not.toContain('Moongphali Chaat');
    expect(dishes).not.toContain('Groundnut Chikki');
    expect(dishes).not.toContain('Moongphali Ladoo');
    expect(dishes).toContain('Plain Idli');
    expect(out.allergyNotice?.removed).toBe(3);
    expect(out.allergyNotice?.sentence).toContain('dishes');
  });
});

describe('the citizen named it — the allergen is shown, and marked', () => {
  it('search() returns what they typed, carrying the reason', async () => {
    const out = await build({ allergies: 'peanuts' }).search('u1', 'chaat');
    const hit = out.results.find((r: any) => r.name === 'Chaat Corner');
    expect(hit).toBeTruthy();
    expect(hit.allergen.found).toBe('Moongphali Chaat');
    expect(hit.allergen.term).toBe('peanuts');
    expect(hit.allergen.label).toContain('peanuts');
  });

  it('search() shows even the place with nothing edible on it — marked', async () => {
    const out = await build({ allergies: 'peanuts' }).search('u1', 'groundnut');
    const hit = out.results.find((r: any) => r.name === 'The Groundnut Bar');
    expect(hit).toBeTruthy();
    expect(hit.allergen.label).toBe('2 dishes here contain peanuts, including Groundnut Chikki.');
  });

  it('detail() marks the offending dish and leaves the rest alone', async () => {
    const out = await build({ allergies: 'peanuts' }).detail('u1', 'r-chaat');
    const items = out.sections.flatMap((s: any) => s.items);
    expect(items.find((i: any) => i.name === 'Moongphali Chaat').allergen.term).toBe('peanuts');
    expect(items.find((i: any) => i.name === 'Sev Puri').allergen).toBeNull();
    expect(out.popularDishes.find((p: any) => p.name === 'Moongphali Chaat').allergen).toBeTruthy();
  });
});

describe('nothing declared, nothing said', () => {
  it('every surface stays silent and removes nothing', async () => {
    const s = build({ allergies: '' });
    const d = await s.discover('u1', {});
    expect(names(d.restaurants).sort()).toEqual(['Chaat Corner', 'Idli House', 'The Groundnut Bar']);
    expect(d.allergyNotice).toBeNull();
    expect((await s.browse('u1', {})).allergyNotice).toBeNull();
    expect((await s.topByLocality('u1', {})).allergyNotice).toBeNull();
    expect((await s.collections('u1', {})).allergyNotice).toBeNull();
    expect((await s.mealMatch('u1', {})).allergyNotice).toBeNull();
    const hit = (await s.search('u1', 'chaat')).results.find((r: any) => r.name === 'Chaat Corner');
    expect(hit.allergen).toBeNull();
  });
});

describe('the declaration is read from everywhere the citizen wrote it', () => {
  it("Medical's allergy records reach the restaurant list too (P1-5)", async () => {
    const s = build({ allergies: '' });
    s.prisma.medicalRecord.findMany = async () => [{ title: 'Peanut allergy — anaphylaxis, carries an EpiPen' }];
    const out = await s.discover('u1', {});
    expect(names(out.restaurants)).not.toContain('The Groundnut Bar');
    expect(out.allergyNotice?.removed).toBe(1);
  });
});
