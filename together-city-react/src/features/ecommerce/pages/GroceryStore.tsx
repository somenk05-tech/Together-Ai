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
  /* 'shops' — this is the Local Market's ROOM, on a rail beside Find a
     service and My business. A directory's answer is a shop; the Open Market
     tab asks the other question and gets the other shape. */
  const shop = useGroceryShop({ path: '/services', label: 'Local Market' }, 'shops');
  return <StoreFront shop={shop} />;
}
