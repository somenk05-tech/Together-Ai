import { PageHeader } from '@/components/ui';
import { AISLES, openShelves } from '../shelves';
import { ShelfTile } from '../ShelfTile';

/**
 * ── THE OPEN MARKET ─────────────────────────────────────────────────────────
 *
 * The right-hand door of the facade: "Explore everything. Choose freely."
 *
 * ONE TILE, DRAWN BY THE SAME COMPONENT AS THE OTHER FLOOR (owner, 22 Aug):
 * a photograph with a name on it and nothing else. `ShelfTile` holds the shape
 * so the two rooms cannot drift apart.
 *
 * ── AND THIS FLOOR IS LABELLED BY AISLE, NOT BY ROOM ────────────────────────
 *
 * Owner, 22 Aug: the market's fitness card should read "Supplements". It read
 * "The Store", which is the Fitness hub's own name for that room — and renaming
 * the room was not available: that rail ALREADY has a Supplements row (05, the
 * goal-matched kit) beside The Store (07, the whole shelf), and two identical
 * rows in one sidebar is a worse problem than the one being fixed.
 *
 * So the market's tiles carry the CATEGORY, which is the thing this floor is
 * actually organised by — its own masthead says so: "Everything the city sells,
 * by category." Skin & hair, Supplements, Pets, Gemstones, Deals & offers. It
 * is an aisle board, and an aisle board naming five shops was the mismatch. The
 * eyebrow used to carry it, and the eyebrow came off with the redesign.
 *
 * The Personalized Store still names the ROOM, because there the card is a
 * shortlist somebody was given rather than an aisle they are walking.
 *
 * The whole shelf rather than a shortlist — no profile is read and nothing is
 * ranked for you. The aisles are the categories the city actually stocks, and
 * there are as many of them as the city has verified, which is fewer than a
 * marketplace would list. Saying so on the page is the point: a market that
 * looks endless and is not teaches somebody to stop believing the rest of it.
 */
export function OpenMarket() {
  const shelves = openShelves();
  return (
    <>
      <PageHeader
        eyebrow="Digital Store"
        title="Open Market"
        sub="Everything the city sells, by category."
      />
      <div className="ec-run">
        {shelves.map((s) => (
          /* THE CARD OPENS THE AISLE WHERE THERE IS ONE (owner, 22 Aug) —
             the whole shelf as a storefront rather than the hub's own room.
             Gemstones and Daily offers have none and still open their room:
             a stone is read off a chart rather than picked off a shelf, and
             an offer is not a product. */
          <ShelfTile key={s.path ?? s.name} soon={Boolean(s.soon)} to={(s.shop && AISLES[s.shop]?.shelf.path) ?? s.path} art={s.art} name={s.category ?? s.name} />
        ))}
      </div>
      <p className="ec-note">
        No resellers — every aisle belongs to the hub that verified what is on it.
      </p>
    </>
  );
}
