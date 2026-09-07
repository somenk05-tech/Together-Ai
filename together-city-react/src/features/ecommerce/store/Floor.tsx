import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HUBS } from '@/config/hubs';
import type { FloorTab, ShelfCard } from '../shelves';
import type { CityCart } from './useCityCart';

/**
 * ── A FLOOR OF THE STORE ────────────────────────────────────────────────────
 *
 * Owner, 6 Sep: "remove the image and just create a Shopify store for both
 * pages, with category tabs on top, in a sleek manner."
 *
 * The two rooms of the district used to be a grid of photographs, one per
 * shelf, each a door to a storefront somewhere else. They are the storefront
 * now. One white page, a bar, a row of categories under it, and the shelf you
 * chose drawn underneath — the same `StoreFront` that already draws every shop
 * in the city, handed this floor to wear on top.
 *
 * THIS FILE KNOWS THE BAR, THE TABS AND A ROOM WITH NO SHELF. It does not know
 * what any tab sells: the labels are the shelves' own names, read out of the
 * sidebar of the room each one belongs to (shelves.ts), and the tab that is
 * on is whatever `?tab=` says, so a category is a link somebody can send.
 *
 * `FloorBar` IS `StoreBar` WITHOUT A SHOP, AND WITH THE WHOLE STORE ON IT.
 * The storefront's bar takes the shop it is drawing, because the bag on it is
 * that shop's. The floor's bar carries the two sections of the Digital Store
 * as a switch — Personalized Store, Open Market — and ONE cart on the right,
 * which is the city cart every shop already feeds (owner, 7 Sep: "the
 * checkout needs to be common for all sectors"). No shop's own bag is drawn
 * on a floor: what you add anywhere is counted once, up there.
 */

export interface Floor {
  /** Which room of the district this is — the section switch marks it. */
  path: string;
  /** The rendered tab row, drawn once by `TabbedFloor` and worn by every pane. */
  tabs: ReactNode;
  /** The city cart — one count, one total, for every shop on every floor. */
  cart: Pick<CityCart, 'count' | 'totalInr'>;
}

/* THE THREE ROOMS OF THE DISTRICT, from the rail: two sections and the cart.
   `the-shop-is-the-citys-own-shelves.test.ts` pins the order. */
const [STORE, MARKET, CART, ORDERS] = HUBS.ecommerce.items;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function FloorBar({ floor }: { floor: Floor }) {
  return (
    <div className="st-bar sf-bar">
      <nav className="sf-sections" aria-label={HUBS.ecommerce.name}>
        {[STORE, MARKET].map((room) => (
          <Link key={room.path} to={room.path}
            className={`sf-section${room.path === floor.path ? ' on' : ''}`}
            aria-current={room.path === floor.path ? 'page' : undefined}>
            {room.label}
          </Link>
        ))}
      </nav>
      <Link to={ORDERS.path} className="st-bar-bag sf-orders-link" aria-current={floor.path === ORDERS.path ? 'page' : undefined}>
        Orders
      </Link>
      <Link to={CART.path} className="st-bar-bag" aria-current={floor.path === CART.path ? 'page' : undefined}>
        Cart{floor.cart.count > 0 ? ` · ${floor.cart.count}` : ''}
      </Link>
    </div>
  );
}

/**
 * THE CATEGORIES, AS LINKS RATHER THAN BUTTONS. A tab that is a link is a tab
 * somebody can bookmark, send, and come back to from the bag; a button with
 * state would forget the shelf the moment the page did. `aria-current` says
 * which one is on, and the underline says it to everybody else.
 *
 * A shelf the city has not built yet keeps its tab — the owner put it on the
 * floor — and wears "Soon" beside its name. Pressing it opens a pane that says
 * so and offers nothing, which is the honest version of a card that opened
 * nothing.
 */
export function FloorTabs({ tabs, active }: { tabs: FloorTab[]; active: string }) {
  return (
    <nav className="sf-tabs" aria-label="Categories">
      <ul className="sf-tabs-in">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              to={`?tab=${t.key}`}
              className={`sf-tab${t.key === active ? ' on' : ''}`}
              aria-current={t.key === active ? 'page' : undefined}
            >
              {t.label}
              {t.shelf.soon && <span className="sf-tab-soon">Soon</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The page every pane on a floor stands in: bar, tabs, whatever is under them,
 * and — when the city cart has anything in it — ONE checkout bar at the foot,
 * the same on every tab of both sections, going to the one cart. The cart
 * page itself passes `baglet={false}`: its Pay button is the checkout.
 */
export function FloorPage({ floor, baglet = true, children }: { floor: Floor; baglet?: boolean; children: ReactNode }) {
  return (
    <div className="st-page">
      <div className="sf-top">
        <FloorBar floor={floor} />
        {floor.tabs}
      </div>
      {children}
      {baglet && floor.cart.count > 0 && (
        <div className="st-baglet">
          <div className="st-baglet-in">
            <span className="st-baglet-n">{floor.cart.count} item{floor.cart.count === 1 ? '' : 's'}</span>
            <span className="st-total">{rupees(floor.cart.totalInr)}</span>
            <Link to={CART.path} className="st-cta">Checkout</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ── A TAB WITH NO SHELF BEHIND IT ───────────────────────────────────────────
 *
 * Two kinds of shelf on these floors are not shops: a room in another hub
 * that holds what the tab names (a pet's diet plan; what local businesses
 * have on today), and a shelf that is not built yet. The first is a window
 * with one door in it — the room's own name and line, and a way to open it.
 * The second is the same window with no door, because there is nothing to
 * open, and this district was deleted once for pretending otherwise.
 */
export function RoomPane({ shelf }: { shelf: ShelfCard }) {
  return (
    <section className="sf-room" aria-labelledby="sf-room-title">
      {shelf.hubName && <div className="st-eyebrow">{shelf.hubName}</div>}
      <h1 id="sf-room-title" className="st-title">{shelf.name}</h1>
      {shelf.line && <p className="st-line">{shelf.line}</p>}
      {shelf.soon ? (
        <p className="sf-room-state">Coming soon</p>
      ) : shelf.path ? (
        <p className="sf-room-act">
          <Link className="btn btn-accent" to={shelf.path}>Open in {shelf.hubName}</Link>
        </p>
      ) : null}
    </section>
  );
}
