import { RestaurantsService } from './restaurants.service';
import { RESTAURANT_SEEDS } from './restaurants.constants';

/**
 * What the Restaurants hub computes today, written down before anything
 * changes it. (P0-2 — same method as the fitness golden master, 6edaef0.)
 *
 * This is a golden master, not a specification: it asserts nothing about
 * whether these numbers are RIGHT, only that they are what they are, so the
 * next change to ranking, macro estimation or order pricing produces a diff
 * that is a complete record of every figure that moved.
 *
 * Everything here calls the real code over the real seed catalogue. The
 * private methods are reached through an any-cast on the prototype — they are
 * pure (hash-derived, no DB, no clock). openNow() and currentSlot() read the
 * wall clock and are deliberately NOT recorded. The mealMatch inner scoring
 * (0.42/0.30/0.16/0.07/0.05) is inline in a DB-bound method; its pure inputs
 * (estimateDishMacros, valueScore, derive) are recorded below, the composition
 * is not — worth extracting one day, not worth mocking a database to reach.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const svc = Object.create(RestaurantsService.prototype) as any;

type Seed = (typeof RESTAURANT_SEEDS)[number];
const row = (s: Seed) => ({ ...s, heroUrl: '', menuJson: JSON.stringify(s.menu) });

describe('what the restaurants engine computes today', () => {
  it('derived attributes (distance, quality, hygiene, flags), per seed', () => {
    expect(Object.fromEntries(RESTAURANT_SEEDS.map((s) => [s.id, svc.derive(row(s))]))).toMatchSnapshot();
  });

  it('the Together City Score and its parts, per seed', () => {
    const table = Object.fromEntries(RESTAURANT_SEEDS.map((s) => {
      const r = row(s);
      const d = svc.derive(r);
      return [s.id, {
        tcScore: svc.tcScore(r, d, s.menu),
        valueScore: svc.valueScore(s.priceForTwoInr),
        menuCompleteness: svc.menuCompleteness(s.menu),
        priceCategory: svc.priceCategory(s.priceForTwoInr),
        category: svc.category(r),
      }];
    }));
    expect(table).toMatchSnapshot();
  });

  it('estimated dish macros, over the real menus', () => {
    const dishes = RESTAURANT_SEEDS.flatMap((s) => s.menu.slice(0, 3)).slice(0, 24);
    expect(Object.fromEntries(dishes.map((d) => [`${d.name} (₹${d.priceInr})`, svc.estimateDishMacros(d)]))).toMatchSnapshot();
  });
});

describe('the money path in placeOrder', () => {
  function build() {
    const seed = RESTAURANT_SEEDS[0];
    const captured: { payment?: { amountInr: number }; order?: any } = {};
    const s: any = Object.create(RestaurantsService.prototype);
    s.prisma = {
      restaurant: { findUnique: async () => row(seed) },
      diningOrder: { findMany: async () => (captured.order ? [captured.order] : []) },
    };
    s.financial = {
      paid: async (_u: string, payment: { amountInr: number }, fn: (tx: any) => Promise<unknown>) => {
        captured.payment = payment;
        return fn({ diningOrder: { create: async (a: { data: any }) => { captured.order = a.data; return a.data; } } });
      },
    };
    s.mail = { deliverSystem: async () => ({}) };
    s.clock = { timezoneFor: async () => 'Asia/Kolkata', dayIn: () => '2026-08-01' };
    return { s, seed, captured };
  }

  it.each(['delivery', 'pickup'] as const)('%s: lines, tax, packing and the billed amount', async (mode) => {
    const { s, seed, captured } = build();
    const items = seed.menu.slice(0, 3).map((d, i) => ({ dishId: d.id, qty: i + 1 }));
    await s.placeOrder('u1', seed.id, { items, mode, method: 'wallet' });
    const o = captured.order!;
    // The order code is random by design; everything else is the record.
    expect({ ...o, code: '(random)', itemsJson: JSON.parse(o.itemsJson) }).toMatchSnapshot();
    // The one non-negotiable: the wallet bills exactly the order total.
    expect(captured.payment!.amountInr).toBe(o.totalInr);
  });

  it('an unknown dish is refused before any money moves', async () => {
    const { s, seed, captured } = build();
    await expect(
      s.placeOrder('u1', seed.id, { items: [{ dishId: 'not-a-dish', qty: 1 }], mode: 'pickup', method: 'wallet' }),
    ).rejects.toThrow('unknown dish');
    expect(captured.payment).toBeUndefined();
  });
});
