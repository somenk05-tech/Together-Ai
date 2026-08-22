import { useHubTheme } from '@/hooks/useHubTheme';
import { StoreFront } from '../store/StoreFront';
import { StoreBagPage } from '../store/StoreBagPage';
import { useBeautyMarketShop, usePetMarketShop, useSupplementsMarketShop } from '../store/useMarketShops';
import { useGemCounterShop } from '../store/useGemCounterShop';

/**
 * ── THE OPEN MARKET'S STOREFRONTS ───────────────────────────────────────────
 *
 * One aisle, one component, three lines — the same shell the shortlist shops
 * use, handed a shop that returns the whole shelf instead of five things.
 *
 * The pet aisle has no bag screen: its cart lives in Pet Care with no till
 * behind it, so there is nothing here to check out and no route for one.
 *
 * The gem counter has both, and it is the only aisle whose tiles carry
 * controls — on that shelf the carats and the grade ARE the product. The shell
 * draws them as dials and knows nothing about either; see useGemCounterShop.
 */

export function SkinHairMarket() {
  useHubTheme(null);
  const shop = useBeautyMarketShop();
  return <StoreFront shop={shop} />;
}

export function SkinHairMarketBag() {
  useHubTheme(null);
  const shop = useBeautyMarketShop();
  return <StoreBagPage shop={shop} />;
}

export function SupplementsMarket() {
  useHubTheme(null);
  const shop = useSupplementsMarketShop();
  return <StoreFront shop={shop} />;
}

export function SupplementsMarketBag() {
  useHubTheme(null);
  const shop = useSupplementsMarketShop();
  return <StoreBagPage shop={shop} />;
}

export function PetMarket() {
  useHubTheme(null);
  const shop = usePetMarketShop();
  return <StoreFront shop={shop} />;
}

export function GemMarket() {
  useHubTheme(null);
  const shop = useGemCounterShop();
  return <StoreFront shop={shop} />;
}

export function GemMarketBag() {
  useHubTheme(null);
  const shop = useGemCounterShop();
  return <StoreBagPage shop={shop} />;
}
