import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { openShelves } from '../shelves';

/**
 * ── THE OPEN MARKET ─────────────────────────────────────────────────────────
 *
 * The right-hand door of the facade: "Explore everything. Choose freely."
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
          <Link key={s.path} to={s.path} className="ec-card ec-go">
            <span className="ec-cat">{s.category}</span>
            <span className="ec-name">{s.name}</span>
            <span className="ec-line">{s.line}</span>
            {/* The hub that stands behind the shelf — unless it is the shelf's
                own name, as it is for the Beauty Market, where printing it
                again says one thing twice. */}
            {s.hubName !== s.name && <span className="ec-from">In {s.hubName}</span>}
          </Link>
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
