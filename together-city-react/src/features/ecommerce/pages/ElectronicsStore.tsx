import { StoreFront } from '../store/StoreFront';
import { useElectronicsShop } from '../store/useElectronicsShop';

/**
 * ── THE ELECTRONICS STORE, AS A ROOM OF THE LOCAL MARKET ────────────────────
 *
 * One shelf, two doors — the grocery store's arrangement, for its reason. The
 * Digital Store draws this under its Electronics tab because that is where a
 * citizen shops; the Local Market lists it as a room because that is whose
 * stock it is. Two copies of the shelf could disagree the first time either was
 * edited, so there is one: `useElectronicsShop`, called from both.
 *
 * The only difference is the way back, which is the door you came in by.
 */
export function ElectronicsStore() {
  const shop = useElectronicsShop({ path: '/services', label: 'Local Market' });
  return <StoreFront shop={shop} />;
}
