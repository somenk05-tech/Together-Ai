import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ONE BAG, AND IT DOES NOT FORGET.
 *
 * The Beauty hub had two. The routine kept one in a `useState` and the market
 * kept another, so a citizen could be looking at "3 items · ₹2,098" on one page
 * and "10 items · ₹6,009" on the other, each with its own checkout button —
 * and following a link erased whichever one they were not looking at. A bag
 * that forgets is worse than no bag: it invites the work of filling it twice.
 *
 * And checkout opened the wallet over whatever page you were on, against a list
 * summarised as one grey line of comma-separated running text with no prices.
 * That is a confirmation dialog with a total on it, not a checkout.
 */
describe('the beauty bag', () => {
  const routine = code('features/beauty/pages/Routine.tsx');
  const market = code('features/beauty/pages/Market.tsx');
  const orders = code('features/beauty/pages/Orders.tsx');
  const bar = code('features/beauty/components/BeautyBagBar.tsx');

  it('is not kept in either page\'s own state', () => {
    for (const [name, src] of [['routine', routine], ['market', market]] as const) {
      expect({ page: name, local: /useState<Record<string, number>>/.test(src) })
        .toEqual({ page: name, local: false });
      expect({ page: name, setBag: /setBag/.test(src) }).toEqual({ page: name, setBag: false });
    }
  });

  it('is the same bag on the routine, the market and the checkout', () => {
    for (const src of [routine, market, orders]) expect(src).toMatch(/useBagActions/);
    expect(bar).toMatch(/useBeautyBag/);
  });

  it('survives a page change because it is on the server', () => {
    // Not localStorage either — a bag in the browser is still a bag that one
    // device has and the next does not.
    const api = code('features/beauty/api.ts');
    expect(api).toMatch(/'\/beauty\/bag'/);
    expect(api).not.toMatch(/localStorage|sessionStorage/);
  });

  it('sends the citizen to the checkout page instead of charging in place', () => {
    expect(bar).toMatch(/to="\/beauty\/orders"/);
    // The wallet is opened on ONE page, and it is the one showing the itemised
    // list. Two pages that can take money is two places to get it wrong.
    expect(bar).not.toMatch(/PaymentSheet/);
    expect(routine).not.toMatch(/PaymentSheet/);
    expect(market).not.toMatch(/PaymentSheet/);
    expect(orders).toMatch(/PaymentSheet/);
  });

  it('itemises the bag at checkout — price each, quantity, line total, total', () => {
    expect(orders).toMatch(/each/);
    expect(orders).toMatch(/l\.priceInr \* l\.qty/);
    expect(orders).toMatch(/bag\.totalInr/);
    // And a picture, because the last screen before paying should not be the
    // first one without them.
    expect(orders).toMatch(/ProductShot/);
  });

  it('lets somebody change their mind on the page where they read the list', () => {
    expect(orders).toMatch(/bagged\.remove/);
    expect(orders).toMatch(/bagged\.add/);
    expect(orders).toMatch(/Empty the bag/);
  });

  it('pays from the city wallet rather than inventing a second way to pay', () => {
    expect(orders).toMatch(/city wallet/);
    expect(orders).toMatch(/usePlaceBeautyOrder/);
  });
});

/**
 * TAKING A DOOR AWAY IS NOT DELETING A ROOM.
 *
 * The Makeup Studio came off the Beauty menu at the owner's word (11 Aug). The
 * page, the look engine and GET /beauty/makeup are untouched and the path still
 * resolves — deleting a working surface in order to hide it is how a feature
 * comes back as a rewrite, and this way it returns in one line.
 */
describe('the makeup studio', () => {
  const hubs = code('config/hubs.ts');
  const router = code('app/router.tsx');

  it('has no way in from the menu', () => {
    expect(hubs).not.toMatch(/label: 'Makeup Studio'/);
  });

  it('still resolves, so no saved link and no test breaks', () => {
    expect(router).toMatch(/path: '\/beauty\/makeup'/);
  });

  it('leaves no gap in the numbering behind it', () => {
    // A menu that counts 01-02-03-05 is a menu advertising the thing it is
    // trying not to advertise.
    const beauty = hubs.slice(hubs.indexOf('beauty: {'), hubs.indexOf('medical: {'));
    const indices = [...beauty.matchAll(/index: '(\d+)'/g)].map((m) => m[1]);
    expect(indices).toEqual(indices.map((_, i) => String(i + 1).padStart(2, '0')));
  });
});
