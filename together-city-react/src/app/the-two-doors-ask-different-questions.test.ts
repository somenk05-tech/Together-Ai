import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE TWO DOORS ASK DIFFERENT QUESTIONS ───────────────────────────────────
 *
 * Owner, 10 Sep: "The Digital Store Open Market should show all the products
 * from all digital stores with the store mentioned below each product, just
 * like the Pet shop… all the feed from grocery stores will be from all local
 * market listed in the 3 km radius, with the user able to expand this to 7 km."
 *
 * THE FOURTH TURN ON THIS SHELF, and the first with a rule rather than a
 * preference. Street (8 Sep) → wall (9 Sep morning) → street (9 Sep evening) →
 * and now BOTH, because the doors were never asking the same thing:
 *
 *   · the LOCAL MARKET room sits on a rail beside Find a service, All listed
 *     services and My business. It is a DIRECTORY, and a directory's answer is
 *     a shop.
 *   · the OPEN MARKET tab sits beside Pets, Skin & hair and Supplements —
 *     every one of them a wall of products with its source named underneath. A
 *     street of shops in that row was the one tab answering a different
 *     question from its neighbours, which is exactly why it read as wrong in
 *     both directions.
 *
 * Three reversals were spent finding that out, and none of them was wasted:
 * each was right about the door being looked at and wrong about the other one.
 */
describe('one hook, two shapes', () => {
  const groc = code('features/ecommerce/store/useGroceryShop.ts');
  const elec = code('features/ecommerce/store/useElectronicsShop.ts');

  it('takes the shape rather than splitting into two hooks', () => {
    /* Two hooks would be the copy that disagrees the first time either is
       corrected. Two shapes off one read cannot. */
    expect(groc).toMatch(/export type ShelfShape = 'shops' \| 'goods';/);
    for (const src of [groc, elec]) expect(src).toMatch(/shape: ShelfShape = 'goods',/);
  });

  it('draws goods for the tab and a street for the room', () => {
    for (const src of [groc, elec]) {
      expect(src).toMatch(/if \(shape === 'goods'\)/);
      expect(src).toMatch(/shopTileOf\(/);
    }
    expect(groc).toMatch(/productTileOf/);
  });

  it('names the shop under every product, which is the whole ask', () => {
    const goods = code('features/ecommerce/store/goodsTile.ts');
    expect(goods).toMatch(/brand: row\.shopName/);
    expect(goods).toMatch(/shopName/);
  });

  it('does not group two shops’ televisions into one product', () => {
    /* Grouping needs a catalogue behind it and the city's catalogue is
       groceries. "55-inch smart TV" from two shops cannot be PROVED to be one
       television, and guessing is the district inventing a fact. */
    expect(elec).not.toMatch(/productTileOf/);
  });

  it('keeps aisle chips on the goods shape only', () => {
    /* A chip filtering "Staples" on a wall of shops would be filtering shops by
       something one line on their shelf happens to be. */
    for (const src of [groc, elec]) expect(src).toMatch(/if \(shape !== 'goods'\) return \[\];/);
  });
});

describe('each door passes the shape it means', () => {
  it('the Local Market rooms ask for shops', () => {
    for (const p of ['features/ecommerce/pages/GroceryStore.tsx', 'features/ecommerce/pages/ElectronicsStore.tsx']) {
      expect(code(p)).toMatch(/label: 'Local Market' \}, 'shops'\)/);
    }
  });

  it('the Open Market tab takes the default, which is goods', () => {
    /* It hands the hooks straight to TabbedFloor by reference, so the default
       IS the tab's answer — and the default is the shape its neighbours use. */
    const tab = code('features/ecommerce/pages/OpenMarket.tsx');
    expect(tab).toMatch(/grocery: useGroceryShop/);
    expect(tab).toMatch(/electronics: useElectronicsShop/);
    expect(tab).not.toMatch(/'shops'/);
  });
});

describe('three kilometres, and seven is the end of it', () => {
  it('stops offering a distance no shop can answer', () => {
    /* A counter trade is capped at 7 km — how far it says it will GO — and
       both radii must agree before a shop appears. 10 and 25 could never
       return a shop that 7 did not: two keys a citizen could press to be told
       the same thing, which reads as an empty shelf rather than a finished
       search. */
    const near = code('features/ecommerce/store/useNearby.ts');
    expect(near).toMatch(/NEAR_STEPS = \[1, 2, 3, 5, 7\]/);
    expect(near).toMatch(/NEAR_DEFAULT_KM = 3/);
    const reach = read('../../together-city-chat/src/local-services/reach.ts');
    expect(reach).toMatch(/REACH_MAX_SHOP_KM = 7/);
  });
});
