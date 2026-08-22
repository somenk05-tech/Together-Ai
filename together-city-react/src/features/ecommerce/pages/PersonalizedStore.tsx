import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { fittedShelves } from '../shelves';

/**
 * ── THE PERSONALIZED STORE ──────────────────────────────────────────────────
 *
 * The left-hand door of the facade: "Made for you. Picked with care."
 *
 * Every card is a room that already existed and already reads a profile — the
 * routine built from a skin assessment, the kit matched to a body goal, the
 * list built from a meal plan, the stone read off a birth chart, the diet built
 * from a pet's own record. None of that is computed here and none of it is
 * repeated here: this page is the door, and the shelf behind it is the engine.
 *
 * WHICH IS WHY EACH CARD NAMES THE PROFILE IT READS, and links to it. A
 * personalised shelf with an empty profile behind it is a shelf that quietly
 * shows you the general case, and the citizen has no way of knowing which one
 * they are looking at. The second link is the answer to "why is this not about
 * me yet".
 */
export function PersonalizedStore() {
  const shelves = fittedShelves();
  return (
    <>
      <PageHeader
        eyebrow="E-Commerce"
        title="Personalized Store"
        sub="Made for you, out of what you have already told the city. Each shelf here reads one profile and answers with a shortlist instead of a catalogue."
      />
      <div className="ec-run">
        {shelves.map((s) => (
          <article key={s.path} className="ec-card">
            <span className="ec-cat">{s.hubName}</span>
            <h2 className="ec-name"><Link to={s.path}>{s.name}</Link></h2>
            <p className="ec-line">{s.line}</p>
            {s.reads && (
              <p className="ec-from">
                Reads your {s.reads.name} — <Link to={s.reads.path}>open it</Link>
              </p>
            )}
          </article>
        ))}
      </div>
      <p className="ec-note">
        This district keeps no shelf of its own. Every product on it belongs to the hub
        that verified it, and that hub is where the price is set and where the money
        moves — which is why a card takes you into the room rather than opening a till
        here.
      </p>
    </>
  );
}
