import { useHubTheme } from '@/hooks/useHubTheme';
import { fittedShelves } from '../shelves';
import { TabbedFloor } from '../store/TabbedFloor';
import { useBeautyShop } from '../store/useBeautyShop';
import { useFitnessShop } from '../store/useFitnessShop';
import { useGemShop } from '../store/useGemShop';

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
 * THE OTHER THREE ARE NOT SHOPS AND DO NOT PRETEND TO BE. The grocery list has
 * no prices, so its tab hands the list over as a file. The pet plan lives in
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
      shopOf={{ beauty: useBeautyShop, supplements: useFitnessShop, gemstones: useGemShop }}
    />
  );
}
