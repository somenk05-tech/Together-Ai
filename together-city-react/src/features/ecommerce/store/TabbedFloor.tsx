import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { tabOf, type ShelfCard } from '../shelves';
import { FloorPage, FloorTabs, RoomPane, type Floor } from './Floor';
import { GroceryDownloadPane } from './GroceryDownloadPane';
import { StoreFront } from './StoreFront';
import type { Shop } from './types';
import { useCityCart } from './useCityCart';

/**
 * ── ONE FLOOR, ITS SHELVES AS TABS ──────────────────────────────────────────
 *
 * Owner, 6 Sep: "just create a Shopify store for both pages with category
 * tabs on top." Both floors are this component, handed their shelves and the
 * adapter that opens each shelf's shop. Nothing about beauty, supplements,
 * stones or pets is written here — the tab row is the shelves' own names and
 * the pane under it is whatever the shelf's adapter hands the storefront.
 *
 * ONE PANE AT A TIME, KEYED ON THE TAB. Each shop is a hook, and a hook cannot
 * be chosen at runtime inside one component — so the pane IS the component,
 * `ShopPane` calls the one hook it was given, and the `key` on it makes a
 * change of tab a fresh mount rather than one instance swapping hooks. It
 * also means the other five shelves are not fetched while you look at one.
 *
 * THE TAB IN THE URL, NOT IN STATE. `?tab=supplements` survives a refresh, a
 * bookmark and the trip to the bag and back; a `useState` would open on the
 * first shelf every time. An unknown or missing tab is the first one, which
 * on the Personalized Store is the routine and on the Open Market is skin &
 * hair — the first shelf on each floor, in the order shelves.ts lists them.
 */

function ShopPane({ useShop, floor }: { useShop: () => Shop; floor: Floor }) {
  const shop = useShop();
  return <StoreFront shop={shop} floor={floor} />;
}

export function TabbedFloor({ path, shelves, shopOf, head }: {
  /** This floor's own route — the section switch marks it. */
  path: string;
  shelves: ShelfCard[];
  /** The adapter that opens each shelf's shop, by the shelf's `shop` key. */
  shopOf: Record<string, () => Shop>;
  /** What this SECTION says, above whichever shelf is open. Written once by
   *  the floor rather than repeated on six shelves. */
  head?: ReactNode;
}) {
  const [params] = useSearchParams();
  /* ONE CART FOR THE WHOLE STORE (owner, 7 Sep). The floor reads the city
     cart — the view over every shop's bag that /ecommerce/cart already
     draws — so the count on the bar and the checkout at the foot are the
     same number on every tab of both sections. */
  const cart = useCityCart();
  const tabs = shelves.map(tabOf);
  const wanted = params.get('tab');
  const active = tabs.find((t) => t.key === wanted) ?? tabs[0];
  const floor: Floor = { path, tabs: <FloorTabs tabs={tabs} active={active.key} />, cart, head };
  const shelf = active.shelf;

  const useShop = shelf.shop ? shopOf[shelf.shop] : undefined;
  if (useShop) return <ShopPane key={active.key} useShop={useShop} floor={floor} />;

  return (
    <FloorPage floor={floor}>
      {shelf.download ? <GroceryDownloadPane shelf={shelf} /> : <RoomPane shelf={shelf} />}
    </FloorPage>
  );
}
