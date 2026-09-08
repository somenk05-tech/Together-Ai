import { useHubTheme } from '@/hooks/useHubTheme';
import { fittedShelves } from '../shelves';
import { TabbedFloor } from '../store/TabbedFloor';
import { useBeautyShop } from '../store/useBeautyShop';
import { useFitnessShop } from '../store/useFitnessShop';
import { useGemShop } from '../store/useGemShop';
import { useGroceryShop } from '../store/useGroceryShop';

/**
 * ── THE PERSONALIZED STORE ──────────────────────────────────────────────────
 *
 * The left-hand door of the facade: "Made for you. Picked with care."
 *
 * IT IS A STORE NOW, NOT A DOOR TO ONE (owner, 6 Sep: "remove the image and
 * just create a Shopify store for both pages with category tabs on top"). It
 * was a grid of six photographs, each opening a white storefront somewhere
 * else. The photographs are gone and the storefront is here: one white page,
 * the bar, the shelves as a row of tabs, and the shelf you chose drawn under
 * them by the same `StoreFront` those six doors used to open.
 *
 * Every tab is a room that already existed and already reads a profile — the
 * routine built from a skin assessment, the kit matched to a body goal, the
 * list built from a meal plan, the stone read off a birth chart, the diet
 * built from a pet's own record. None of that is computed here and none of it
 * is repeated here: the shelves are read out of shelves.ts, their names out of
 * the sidebar of the room each belongs to, and the three that have shops are
 * opened by the adapters that always opened them.
 *
 * THE GROCERY TAB IS A SHOP NOW (owner, 8 Sep: "instead of grocery list create
 * a grocery store with vegetables, food items, household items etc."). It was
 * a download — the week's ingredients as a text file, because the shelf behind
 * it had no prices. It is a shelf of local grocers' own rows now, at their own
 * prices; it still takes no money, because each shop takes its own order on
 * its own page, and `useGroceryShop` says so on the shelf rather than miming a
 * till the city does not have.
 *
 * THE OTHER TWO ARE NOT SHOPS AND DO NOT PRETEND TO BE. The pet plan lives in
 * Pet Care, so its tab is a window with that room's door in it. Costume
 * jewellery is not built, so its tab says so and opens nothing.
 *
 * `useHubTheme(null)` for the same reason every storefront calls it: the page
 * is white from every direction, whichever district you walked in from.
 */
export function PersonalizedStore() {
  useHubTheme(null);
  return (
    <TabbedFloor
      path="/ecommerce/store"
      shelves={fittedShelves()}
      shopOf={{ beauty: useBeautyShop, supplements: useFitnessShop, gemstones: useGemShop, grocery: useGroceryShop }}
      /* ── WHAT THIS FLOOR IS, SAID ONCE (owner, 7 Sep) ────────────────────
         His words, in sentence case rather than the capitals he typed them
         in: this city sets one line in caps — the tracked label — and a
         sentence in that treatment reads as a sign rather than as speech.

         IT IS NOT A HEADING ELEMENT, and that is deliberate. The page's <h1>
         is the shelf you are looking at ("Your Beauty Routine"), which is
         what the page is ABOUT at that moment; this is the section's standing
         promise above it. A second <h1> would be two answers to "what page is
         this", and demoting the shelf's own title is not possible — the same
         storefront is drawn without a floor on six other routes, where its
         title is the only heading there is.

         EVERY CLAIM IS A ROOM THAT EXISTS. The shelves below are built from a
         skin assessment, a body goal, a meal plan, a birth chart and a pet's
         record; "your store adapts to your needs, your preferences and your
         lifestyle" is a description of that, not a promise beyond it. */
      head={(
        <section className="st-hero" aria-label="Your personalized store">
          <div className="st-eyebrow">Your personalized store</div>
          <p className="st-hero-title">Only what&rsquo;s right for you.</p>
          <p className="st-line">
            Everything here is personalized for you. Your store adapts to your
            needs, your preferences, and your lifestyle &mdash; so you never see
            what doesn&rsquo;t fit.
          </p>
        </section>
      )}
    />
  );
}
