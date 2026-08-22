import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { SHOPS, fittedShelves } from '../shelves';

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
 * THE WHOLE CARD IS THE DOOR (owner, 22 Aug), which cost the second link. Each
 * card used to carry "Reads your Skin & Hair Profile — open it" underneath, and
 * a link inside a clickable card is a target inside a target: on a phone the
 * two are four millimetres apart and the small one wins by accident. The
 * profile is named at the top of the shop instead, where somebody looking at a
 * shortlist that is not about them yet is actually standing.
 *
 * AND WHERE A SHELF HAS A SHOP, THE CARD OPENS THE SHOP. Beauty is the first:
 * `/ecommerce/shop/beauty` is the routine's shortlist as a white storefront
 * with its own bag and till. The other four still open their hub's own room —
 * a card that promised a shop and delivered a district would be the 10 Aug
 * mistake in miniature.
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
          <Link key={s.path} to={(s.shop && SHOPS[s.shop]?.shelf.path) ?? s.path} className="ec-card ec-go">
            <span className="ec-cat">{s.hubName}</span>
            <span className="ec-name">{s.name}</span>
            <span className="ec-line">{s.line}</span>
            {s.reads && <span className="ec-from">Reads your {s.reads.name}</span>}
          </Link>
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
