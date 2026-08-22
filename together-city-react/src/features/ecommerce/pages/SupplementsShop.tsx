import { useHubTheme } from '@/hooks/useHubTheme';
import { StoreFront } from '../store/StoreFront';
import { StoreBagPage } from '../store/StoreBagPage';
import { useFitnessShop } from '../store/useFitnessShop';

/** The supplement shelf's two screens. Three lines each, like every shop. */

export function SupplementsShop() {
  useHubTheme(null);
  const shop = useFitnessShop();
  return <StoreFront shop={shop} />;
}

export function SupplementsShopBag() {
  useHubTheme(null);
  const shop = useFitnessShop();
  return <StoreBagPage shop={shop} />;
}
