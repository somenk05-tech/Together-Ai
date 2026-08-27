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

/**
 * AND THE SAME DECISION, MADE AGAIN.
 *
 * Activity Dating came off the Dating menu at the owner's word (12 Aug), and
 * explicitly "for now" — which is exactly why nothing else moved. Page,
 * invitation engine and endpoints untouched; the route still resolves.
 *
 * THE HALF THAT WAS MISSED THE FIRST TIME IS ASSERTED HERE. Hiding a surface
 * has two parts: taking it off the menu, and telling nav-audit the silence is
 * deliberate. The Makeup Studio only ever got the first, so the audit failed on
 * it for a day and every landing script since had to explain itself against a
 * main that was already red. An audit that is expected to fail is an audit
 * nobody reads — so both entries are checked below, and the makeup one is
 * checked even though it predates this change.
 */
describe('a hidden surface is declared hidden', () => {
  const hubs = code('config/hubs.ts');
  const router = code('app/router.tsx');
  const navAudit = code('../scripts/nav-audit.mjs');

  it('removes Activity Dating ENTIRELY — off the menu and out of the router', () => {
    // Removed 27 Aug (launch audit). Unlike Makeup and My Plan below, this one
    // was not hidden but deleted: its anonymous chats surfaced in main Chats
    // under the other person's real name, and its invitations could not be
    // declined short of a block. So the room does NOT stand — the route is gone.
    expect(hubs).not.toMatch(/label: 'Activity Dating'/);
    expect(router).not.toMatch(/path: '\/dating\/activity'/);
  });

  it('takes My Plan off the Fitness menu and leaves that room standing too', () => {
    // The owner, 16 Aug. Third of the same shape, and the third time the room
    // is left standing: the page, the plan engine and GET /fitness/plan are
    // untouched and the route still resolves, so a saved link opens exactly as
    // it did. Hidden is one line to put back; deleted is a rewrite.
    expect(hubs).not.toMatch(/label: 'My Plan'/);
    expect(router).toMatch(/path: '\/fitness\/plan'/);
    // AND NO DOOR IS LEFT ON IT. Body Goal carried "See my weekly plan →"
    // pointing straight at it — a link into a room that is off the map is how a
    // hidden surface comes back by accident, and it is the one thing that would
    // make nav-audit and the next reader disagree about whether it exists.
    expect(code('features/fitness/pages/BodyGoal.tsx')).not.toMatch(/to="\/fitness\/plan"/);
  });

  it('declares both hidden surfaces to nav-audit, with a reason', () => {
    // The reason string is not decoration: nav-audit prints it, and it is what
    // tells the next person whether a route is hidden on purpose or stranded.
    for (const path of ['/beauty/makeup', '/fitness/plan']) {
      const entry = navAudit.match(new RegExp(`\\['${path}', '([^']*(?:\\\\'[^']*)*)'\\]`));
      expect({ path, declared: Boolean(entry) }).toEqual({ path, declared: true });
      expect(entry![1].length).toBeGreaterThan(40);
    }
  });

  it('leaves no gap in any hub menu, not just the one that lost a page', () => {
    // THIS USED TO CHECK BEAUTY ALONE while its own note claimed it covered
    // every hub. The first hub to lose a page after it was written was a
    // different one, which is the way a guard scoped to one example always
    // fails: not by breaking, but by being silent somewhere else.
    // ` {2}` rather than two literal spaces: the lint rule is right that
    // spaces are hard to count, and this regex is anchored on indentation.
    const blocks = [...hubs.matchAll(/^ {2}([a-z]+): \{[\s\S]*?\n {2}\},$/gm)];
    expect(blocks.length).toBeGreaterThan(8);
    for (const [block, hub] of blocks) {
      const indices = [...block.matchAll(/index: '(\d+)'/g)].map((m) => m[1]);
      if (!indices.length) continue;
      expect({ hub, indices })
        .toEqual({ hub, indices: indices.map((_, i) => String(i + 1).padStart(2, '0')) });
    }
  });
});
