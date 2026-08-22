import { PageHeader } from '@/components/ui';
import { AISLES, openShelves } from '../shelves';
import { ShelfTile } from '../ShelfTile';

/**
 * ── THE OPEN MARKET ─────────────────────────────────────────────────────────
 *
 * The right-hand door of the facade: "Explore everything. Choose freely."
 *
 * ONE TILE, DRAWN BY THE SAME COMPONENT AS THE OTHER FLOOR (owner, 22 Aug):
 * a photograph with the shelf's name on it and nothing else. `ShelfTile` holds
 * the shape so the two rooms cannot drift apart.
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
        eyebrow="E-Commerce"
        title="Open Market"
        sub="Everything the city sells, by category — the whole shelf, in the room that stands behind it."
      />
      <div className="ec-run">
        {shelves.map((s) => (
          /* THE CARD OPENS THE AISLE WHERE THERE IS ONE (owner, 22 Aug) —
             the whole shelf as a storefront rather than the hub's own room.
             Gemstones and Daily offers have none and still open their room:
             a stone is read off a chart rather than picked off a shelf, and
             an offer is not a product. */
          <ShelfTile key={s.path} to={(s.shop && AISLES[s.shop]?.shelf.path) ?? s.path} art={s.art} name={s.name} />
        ))}
      </div>
      <p className="ec-note">
        Together City lists what it has checked rather than everything that could be
        sold, so this floor is the size of the work behind it and grows as a hub adds a
        shelf. There are no resellers here: each aisle belongs to the hub that verified
        what is on it.
      </p>
    </>
  );
}
