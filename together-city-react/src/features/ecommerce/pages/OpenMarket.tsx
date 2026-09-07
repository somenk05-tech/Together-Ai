import { useHubTheme } from '@/hooks/useHubTheme';
import { openShelves, shelfName } from '../shelves';
import { TabbedFloor } from '../store/TabbedFloor';
import { useGemCounterShop } from '../store/useGemCounterShop';
import { useBeautyMarketShop, usePetMarketShop, useSupplementsMarketShop } from '../store/useMarketShops';

/**
 * ── THE OPEN MARKET ─────────────────────────────────────────────────────────
 *
 * The right-hand door of the facade: "Explore everything. Choose freely."
 *
 * THE SAME STORE AS THE OTHER FLOOR, OPPOSITE SELECTION (owner, 6 Sep). One
 * white page, the bar, the aisles as a row of tabs, and the whole shelf under
 * the one you chose — nothing ranked for you, which is what this floor's own
 * sidebar line promises. The four aisles with a storefront are opened by the
 * adapters that always opened them; the storefront draws its own chips inside
 * a long aisle, so the pet catalogue's 184 rows are still a shop somebody
 * browses rather than a wall.
 *
 * THE TABS ARE AISLES, NOT ROOMS (owner, 22 Aug): Skin & hair, Supplements,
 * Pets, Gemstones, Deals & offers, Jewellery. The fitness aisle reads
 * "Supplements" and not "The Store", which is the Fitness hub's own name for
 * that room, because this floor is organised by what is sold and its masthead
 * says so. The names come from shelves.ts, which reads them from the sidebar
 * of the room each aisle belongs to.
 *
 * Deals & offers is not products — it is what local businesses have on today,
 * and it lives in Local Services — so its tab is a window with that room's
 * door in it. Jewellery is not built yet; its tab says so and opens nothing.
 */
export function OpenMarket() {
  useHubTheme(null);
  return (
    <TabbedFloor
      name={shelfName('ecommerce', '/ecommerce/market')}
      shelves={openShelves()}
      shopOf={{ 'skin-hair': useBeautyMarketShop, supplements: useSupplementsMarketShop, pets: usePetMarketShop, gemstones: useGemCounterShop }}
    />
  );
}
