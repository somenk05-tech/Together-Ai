import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AISLES, OPEN, openShelves } from '@/features/ecommerce/shelves';
import { quoteInr } from '@/features/ecommerce/store/useGemCounterShop';
import type { CounterStone } from '@/features/astrology/api';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(SRC, '..', '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const api = (p: string) => readFileSync(join(API, p), 'utf8');
const code = (p: string) => read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const stone = (over: Partial<CounterStone> = {}): CounterStone => ({
  gem: { perCaratMinInr: 8000, perCaratMaxInr: 25000 } as CounterStone['gem'],
  fromCt: 2.75, toCt: 5.5, fromRatti: 3, toRatti: 6, defaultCt: 4, fromInr: 32000, toInr: 100000,
  ...over,
});

/**
 * ── THE COUNTER QUOTES WHAT THE TILL WILL CHARGE ────────────────────────────
 *
 * Owner, 22 Aug: "a gemstone store with all the gemstones in the database …
 * prices move based on carats chosen by the user."
 *
 * A price that moves as a slider moves cannot be fetched per pixel, so this
 * shelf computes its own — and the moment a shop computes a price, the shop and
 * the till are two answers to one question. Every other price in this district
 * is quoted whole from the server precisely to avoid that. These are the
 * assertions that earn the exception: the arithmetic here has to be the
 * arithmetic there, and both are checked against the file that owns it.
 *
 * WHAT IS NOT ASSERTED, because it is not true: that the quote IS the charge.
 * It is not. The gem cart reprices every line at read time from the catalogue,
 * which is the rule it was built on because gold moves daily. The quote is what
 * the counter promises; the till is what it costs.
 */
describe('the gem counter quotes what the till will charge', () => {
  it('prices carats × the per-carat rate, interpolated by grade', () => {
    const s = stone();
    // The floor of the quality axis is the cheap per-carat rate, the ceiling is
    // the dear one, and the grade walks between them.
    expect(quoteInr(s, { carats: 4, grade: 0 })).toBe(4 * 8000);
    expect(quoteInr(s, { carats: 4, grade: 100 })).toBe(4 * 25000);
    expect(quoteInr(s, { carats: 4, grade: 50 })).toBe((4 * 8000 + 4 * 25000) / 2);
  });

  it('moves the price with the carats, which is the whole request', () => {
    const s = stone();
    const at = (ct: number) => quoteInr(s, { carats: ct, grade: 35 });
    expect(at(5.5)).toBeGreaterThan(at(2.75));
    /* Linear in the weight: twice the stone is twice the money at one grade —
       to the rupee, which is where the `1` comes from. `quoteInr` rounds ONCE,
       at the end, so doubling a figure that was already rounded can miss by a
       rupee. Rounding twice to make this assertion exact would be the tail
       wagging the dog; a shop that is a rupee out on a ₹76,725 stone is not the
       problem this file is looking for. */
    expect(Math.abs(at(5.5) - at(2.75) * 2)).toBeLessThanOrEqual(1);
  });

  /**
   * THE SAME FORMULA, ON BOTH SIDES OF THE WIRE. `priceAtWeight` is carats
   * times each per-carat rate; `priceGemCart` interpolates between the two by
   * grade. If either changes, this fails rather than the shop and the till
   * quietly disagreeing — which is the failure nobody notices until somebody
   * is charged.
   */
  it('runs the same arithmetic the server runs', () => {
    const weight = api('astrology/gems/gem-weight.ts');
    expect(weight).toMatch(/fromInr:\s*Math\.round\(carats \* perCaratMin\)/);
    expect(weight).toMatch(/toInr:\s*Math\.round\(carats \* perCaratMax\)/);
    const cart = api('astrology/gems/gem-cart.ts');
    expect(cart).toMatch(/p\.fromInr \+ \(\(p\.toInr - p\.fromInr\) \* l\.grade\) \/ 100/);

    // And the two together are what quoteInr does, checked as a number rather
    // than as a regex on this side.
    const s = stone();
    const server = (ct: number, grade: number) => {
      const fromInr = Math.round(ct * s.gem.perCaratMinInr);
      const toInr = Math.round(ct * s.gem.perCaratMaxInr);
      return Math.round(fromInr + ((toInr - fromInr) * grade) / 100);
    };
    for (const ct of [2.75, 3.5, 4.25, 5.5]) {
      for (const grade of [0, 35, 65, 100]) {
        expect(quoteInr(s, { carats: ct, grade })).toBe(server(ct, grade));
      }
    }
  });
});

/**
 * ── AND THE STONE STILL HAS A SAY ──────────────────────────────────────────
 *
 * The weight model exists because the naive rule — one body-weight formula for
 * all thirty stones — prescribed a nine-carat blue sapphire, and heavy Neelam
 * is the classic warning in every account of that stone. A slider is the naive
 * rule again unless it is bounded by the stone's own customary range. The
 * server holds it (asserted in the API's own gem-counter.spec.ts); this asserts
 * the client never offers what the server would refuse.
 */
describe('the dials are bounded by what the stone is worn at', () => {
  it('spans the stone’s own range and nothing wider', () => {
    const shop = code('features/ecommerce/store/useGemCounterShop.ts');
    /* Read the CARATS dial alone. The grade dial's 0–100 is a scale rather than
       a property of any stone, and it is hand-typed on purpose — the server
       clamps grade to the same two numbers. */
    const dial = shop.slice(shop.indexOf("key: 'carats'"), shop.indexOf("key: 'grade'"));
    expect(dial).toMatch(/min:\s*s\.fromCt/);
    expect(dial).toMatch(/max:\s*s\.toCt/);
    // Never a hand-typed bound: the range belongs to the stone.
    expect(dial).not.toMatch(/min:\s*[0-9]|max:\s*[0-9]/);
  });

  it('steps in the quarter carats a jeweller actually cuts', () => {
    expect(code('features/ecommerce/store/useGemCounterShop.ts')).toMatch(/step:\s*0\.25/);
    expect(api('astrology/gems/gem-weight.ts')).toMatch(/const quarter = \(n: number\) => Math\.round\(n \* 4\) \/ 4/);
  });

  /**
   * THE SHELL IS STILL IGNORANT OF WHAT IT SELLS. A `carats` field on ShopItem
   * would have been the shorter change and it would have put the vocabulary of
   * one shelf into the shell all five use — the same mistake as a price in the
   * storefront, which this district has already refused once.
   */
  it('keeps the word out of the storefront', () => {
    const front = code('features/ecommerce/store/StoreFront.tsx');
    expect(front).not.toMatch(/carat|gem|stone/i);
    expect(front).toMatch(/item\.dials\?\.map/);
  });
});

/**
 * ── THE COUNTER IS NOT THE PRESCRIPTION ────────────────────────────────────
 *
 * Two gem rooms now stand in one district, and the whole risk is that they
 * blur: a shelf that ranks nothing wearing the authority of a reading, or a
 * reading quietly turned into a slider. They are asserted apart.
 */
describe('two gem rooms, and they are not each other', () => {
  it('opens the counter from the market and the chart’s own five from the store', () => {
    expect(OPEN.find((s) => s.hub === 'astrology')?.shop).toBe('gemstones');
    expect(AISLES.gemstones.shelf.path).toBe('/ecommerce/market/gemstones');
    expect(openShelves().find((s) => s.hub === 'astrology')?.category).toBe('Gemstones');
  });

  it('routes both screens of the counter', () => {
    const files = ['app/router.tsx', 'features/ecommerce/routes.tsx'].filter((f) => existsSync(join(SRC, f)));
    const declared = new Set(files.flatMap((f) => [...read(f).matchAll(/path: '([^']+)'/g)].map((m) => m[1])));
    for (const p of ['/ecommerce/market/gemstones', '/ecommerce/market/gemstones/bag']) {
      expect({ path: p, routed: declared.has(p) }).toEqual({ path: p, routed: true });
    }
  });

  it('reads no chart on the counter and prescribes nothing', () => {
    const shop = code('features/ecommerce/store/useGemCounterShop.ts');
    // The prescription's hooks and its "needsProfile" answer belong to the
    // other room; a counter that asked for a birth date would be one.
    expect(shop).not.toMatch(/useAstroGemstones|needsProfile|recommendations/);
    expect(shop).toMatch(/useGemCatalog/);
    // And it says out loud which room is which, on the shelf itself.
    expect(read('features/ecommerce/store/useGemCounterShop.ts')).toMatch(/Nothing here is a recommendation/);
  });

  it('keeps the prescription’s own shop reading the chart', () => {
    const shop = code('features/ecommerce/store/useGemShop.ts');
    expect(shop).toMatch(/useAstroGemstones/);
    expect(shop).not.toMatch(/useGemCatalog|dials/);
  });

  /**
   * THE STUDIO NEVER SENDS A CHOSEN WEIGHT, and that is the load-bearing half
   * of this change. A prescription reads its carats off the chart; a slider in
   * that room would be inviting somebody to overrule their own reading, and a
   * commission locked there must go on pricing from the body weight exactly as
   * it did before the counter existed.
   */
  it('lets only the counter choose a weight', () => {
    expect(code('features/astrology/pages/GemStudio.tsx')).not.toMatch(/carats:/);
    expect(code('features/ecommerce/store/useGemCounterShop.ts')).toMatch(/carats: t\.carats/);
    // The server prices from the chosen weight only where one was sent.
    expect(api('astrology/gems/gem-cart.ts')).toMatch(/l\.carats !== undefined/);
    expect(api('astrology/gems/gem-cart.ts')).toMatch(/recommendedWeight\(bodyKg/);
  });
});
