import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const WEB = join(SRC, '..', '..', 'together-city-react', 'src');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

/** Comments name what was removed, so an absence check that reads them can
 *  never go green. Strip them first. Trap 8, and this repo has paid for it. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

/**
 * THE RESTAURANTS HUB IS GONE, AND IT CANNOT COME BACK BY ACCIDENT.
 *
 * The hub sold an invented catalogue. RESTAURANT_SEEDS placed made-up
 * restaurants at real Bengaluru localities, with made-up star ratings and
 * priced menus; `placeOrder` debited the one city wallet and emailed a receipt;
 * `reserve()` handed out a table-booking code. The service said the quiet part
 * itself: "A citizen following one turns up at an address where no such
 * restaurant exists."
 *
 * PRODUCTION HAD ALREADY REFUSED IT. Without SEED_DEMO=true, `ensureSeeds()`
 * deleted the seeded rows on boot and the hub showed an honest empty state —
 * the same gate flights, tours and job postings sit behind. What shipped to
 * citizens was a room with nothing in it, wearing a lamp in the rail.
 *
 * So it was removed rather than restocked, on the owner's word. This file is
 * what keeps it removed. The grocery flow taught the lesson it is written from:
 * the gate that checked that removal ran once, inside a landing script, and was
 * gone the moment the script finished.
 *
 * WHAT DID NOT GO, AND WHY EACH ONE STAYS:
 *
 *   · Local Services still has a `restaurants` CATEGORY. That is a real
 *     business listing a real person creates and verifies. Removing the
 *     invented catalogue is not the same as deciding the city has no
 *     restaurants in it, and conflating the two would delete somebody's shop.
 *   · Financial still has a `dining` BUDGET. People eat out whether or not this
 *     app has an opinion about where, and a budget category is the citizen's
 *     own money, not this hub's furniture.
 *   · The allergen matcher in `shared/allergens` is untouched. Restaurants was
 *     one of five readers; nutrition, beauty and the household merge are the
 *     others and they are all still asking it the same question.
 *   · Wallet transactions from any order that was ever placed are untouched.
 *     Deleting a receipt because the shop closed is not a cleanup.
 */
describe('the restaurants hub', () => {
  it('has no module left on the API rail', () => {
    expect(existsSync(join(SRC, 'restaurants'))).toBe(false);
  });

  it('is not wired into the app or into Mira', () => {
    for (const f of ['app.module.ts', 'mira/mira.module.ts', 'mira/mira.service.ts']) {
      expect({ f, has: /RestaurantsModule|RestaurantsService/.test(codeOnly(read(SRC, f))) })
        .toEqual({ f, has: false });
    }
  });

  it('cannot charge anybody, because there is nothing left to charge for', () => {
    // Scoped by absence of the module rather than by grepping for placeOrder:
    // beauty and travel have their own, which are different flows with their
    // own decisions behind them.
    expect(existsSync(join(SRC, 'restaurants', 'restaurants.service.ts'))).toBe(false);
    expect(existsSync(join(SRC, 'restaurants', 'restaurants.controller.ts'))).toBe(false);
  });

  it('has no tables and no back-relations in the schema', () => {
    const schema = read(SRC, '..', 'prisma', 'schema.prisma');
    for (const model of ['model Restaurant ', 'model DiningOrder ', 'model Reservation ']) {
      expect({ model, present: schema.includes(model) }).toEqual({ model, present: false });
    }
    expect(schema).not.toMatch(/^\s+(diningOrders|reservations)\s+\w+\[\]/m);
  });

  it('is not a room, a route or a lamp on the page rail', () => {
    expect(existsSync(join(WEB, 'features', 'restaurants'))).toBe(false);
    expect(codeOnly(read(WEB, 'app', 'router.tsx'))).not.toContain('features/restaurants');
    expect(codeOnly(read(WEB, 'config', 'hubs.ts'))).not.toMatch(/restaurants/);
    expect(read(WEB, 'styles', 'tokens.css')).not.toContain('[data-hub="restaurants"]');
  });

  it('and Mira does not offer a room she cannot open', () => {
    // She answered "find somewhere for dinner" with a path. A path into a hub
    // that no longer exists is a 404 delivered in her voice, which is worse
    // than her saying she cannot help.
    const city = codeOnly(read(SRC, 'mira', 'city.ts'));
    expect(city).not.toContain('/restaurants/');
    expect(city).not.toMatch(/key: 'restaurants'/);
  });
});

/**
 * AND THE THINGS THAT STAYED ARE STILL THERE.
 *
 * An absence suite that only checks absences is one careless `git rm` away
 * from being satisfied by an empty repository.
 */
describe('what the removal was not allowed to take with it', () => {
  it('leaves Local Services its restaurants category', () => {
    expect(read(SRC, 'local-services', 'categories.ts')).toContain("key: 'restaurants'");
  });

  it('leaves the dining budget alone', () => {
    expect(read(SRC, 'financial', 'financial.service.ts')).toContain("key: 'dining'");
  });

  it('leaves the allergen matcher with its other four readers', () => {
    expect(existsSync(join(SRC, 'shared', 'allergens.ts'))).toBe(true);
  });
});
