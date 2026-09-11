/**
 * The eight grocery trades — the SERVER's list (together-city-chat
 * local-services/grocery.ts GROCERY_CATEGORIES), held here so the business
 * page can pick the storefront without a round trip. a-shop-not-a-menu.test.ts
 * fails the build if the two lists drift.
 */
export const GROCERY_TRADES = [
  'grocery_stores', 'supermarkets', 'fruit_and_vegetable_markets', 'butcher_shops',
  'fish_markets', 'convenience_stores', 'bakeries', 'water_delivery',
] as const;

export const isGroceryTrade = (key: string): boolean => (GROCERY_TRADES as readonly string[]).includes(key);
