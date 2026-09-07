import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HUBS } from '@/config/hubs';
import type { FloorTab, ShelfCard } from '../shelves';

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
 * `FloorBar` IS `StoreBar` WITHOUT A SHOP. The storefront's bar takes the
 * shop it is drawing, because the bag on it is that shop's. A tab that opens
 * no shop — the grocery list, a room in another hub, a shelf not built yet —
 * has no bag, and a bar that needed one would have had to invent it.
 */

export interface Floor {
  /** The room's own name — "Personalized Store", "Open Market" — from `HUBS`. */
  name: string;
  /** The rendered tab row, drawn once by `TabbedFloor` and worn by every pane. */
  tabs: ReactNode;
}

export function FloorBar({ name, bag }: { name: string; bag?: { count: number; to: string } | null }) {
  return (
    <div className="st-bar">
      <Link to={HUBS.ecommerce.backPath} className="st-back"><span aria-hidden>←</span> {HUBS.ecommerce.name}</Link>
      <span className="st-bar-name">{name}</span>
      {bag && (
        <Link to={bag.to} className="st-bar-bag">
          Bag{bag.count > 0 ? ` · ${bag.count}` : ''}
        </Link>
      )}
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

/** The page every pane on a floor stands in: bar, tabs, and whatever is under them. */
export function FloorPage({ floor, bag, children }: { floor: Floor; bag?: { count: number; to: string } | null; children: ReactNode }) {
  return (
    <div className="st-page">
      <div className="sf-top">
        <FloorBar name={floor.name} bag={bag} />
        {floor.tabs}
      </div>
      {children}
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
