import { StoreFront } from '../store/StoreFront';
import { useGroceryShop } from '../store/useGroceryShop';

/**
 * ── THE GROCERY STORE, AS A ROOM OF THE LOCAL MARKET ────────────────────────
 *
 * One shelf, two doors — the gemstone bench's arrangement, for the same
 * reason. The Digital Store draws this under its Grocery Store tab because
 * that is where a citizen shops; the Local Market lists it as a room because
 * that is whose stock it is. Two copies of the shelf could disagree the first
 * time either was edited, so there is one: `useGroceryShop`, called from both.
 *
 * The only difference is the way back, which is the door you came in by.
 */
export function GroceryStore() {
  const shop = useGroceryShop({ path: '/services', label: 'Local Market' });
  return <StoreFront shop={shop} />;
}
