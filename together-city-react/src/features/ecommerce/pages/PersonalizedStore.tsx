import { PageHeader } from '@/components/ui';
import { SHOPS, fittedShelves } from '../shelves';
import { ShelfTile } from '../ShelfTile';
import { GroceryDownloadCard } from '../store/GroceryDownloadCard';

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
 *
 * THE CARD IS A PHOTOGRAPH NOW (owner, 22 Aug), and it is `ShelfTile` rather
 * than markup written here — the same component the Open Market draws, so the
 * two floors cannot end up different sizes. What each tile carries, and what it
 * stopped carrying, is argued in that file.
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
        {shelves.map((s) => (s.download ? (
          /* ONE CARD IN THE RUN IS NOT A DOOR. The grocery list is the only
             shelf here that cannot become a shop, so rather than sending
             somebody to another hub to fetch their own list, the card hands it
             over. Same material, same place in the grid, different verb. */
          <GroceryDownloadCard key={s.path} shelf={s} />
        ) : (
          <ShelfTile key={s.path ?? s.name} soon={Boolean(s.soon)} to={(s.shop && SHOPS[s.shop]?.shelf.path) ?? s.path} art={s.art} name={s.category ?? s.name} />
        )))}
      </div>
      <p className="ec-note">
        This district keeps no shelf of its own. Every product on it belongs to the hub
        that verified it, and that hub is where the price is set — which is why a card
        opens that shop rather than a till of this district’s own. The grocery list is the
        exception and the reason is the same one: it has no price on it and nothing to
        charge for, so the card simply hands it to you.
      </p>
    </>
  );
}
