import { useHubTheme } from '@/hooks/useHubTheme';
import { StoreFront } from '../store/StoreFront';
import { StoreBagPage } from '../store/StoreBagPage';
import { useBeautyShop } from '../store/useBeautyShop';

/**
 * ── THE BEAUTY SHELF'S TWO SCREENS ──────────────────────────────────────────
 *
 * Both are three lines, and that is the whole point of the shell: a shelf joins
 * the store by writing one adapter and one file like this. The next four —
 * supplements, groceries, gemstones, the pet plan — arrive the same way.
 *
 * `useHubTheme(null)` IS NOT DECORATION. `data-hub` is set on <html> by whatever
 * room you were last in and only ever REPLACED, never cleared, so arriving here
 * from the Beauty Market would leave the store wearing plum and arriving from
 * Astrology would leave it wearing a night sky. The store is white; this is the
 * line that makes it white from every direction.
 */

export function BeautyShop() {
  useHubTheme(null);
  const shop = useBeautyShop();
  return <StoreFront shop={shop} />;
}

export function BeautyShopBag() {
  useHubTheme(null);
  const shop = useBeautyShop();
  return <StoreBagPage shop={shop} />;
}
