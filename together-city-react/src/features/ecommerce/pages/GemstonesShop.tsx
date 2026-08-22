import { useHubTheme } from '@/hooks/useHubTheme';
import { StoreFront } from '../store/StoreFront';
import { StoreBagPage } from '../store/StoreBagPage';
import { useGemShop } from '../store/useGemShop';

/** The gem bench's two screens. The shelf has no Add button — see useGemShop. */

export function GemstonesShop() {
  useHubTheme(null);
  const shop = useGemShop();
  return <StoreFront shop={shop} />;
}

export function GemstonesShopBag() {
  useHubTheme(null);
  const shop = useGemShop();
  return <StoreBagPage shop={shop} />;
}
