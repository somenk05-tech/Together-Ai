import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROCERY_TRADES, isGroceryTrade } from '@/features/services/grocery-trades';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * Owner, 11 Sep: "change the layout of grocery stores in the local market to
 * this design [a grocery e-commerce front] and let users add the images for
 * the item; for now you scrape the internet and add the items photos."
 */
describe('a grocer’s stock list is a shop, not a menu (owner, 11 Sep)', () => {
  it('names the same eight grocery trades the server does', () => {
    const server = read('../../together-city-chat/src/local-services/grocery.ts');
    const block = server.slice(server.indexOf('export const GROCERY_CATEGORIES'), server.indexOf('] as const;'));
    const keys = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...GROCERY_TRADES]).toEqual(keys);
    expect(isGroceryTrade('grocery_stores')).toBe(true);
    expect(isGroceryTrade('electronics_stores')).toBe(false);
  });

  it('draws the storefront for a grocery trade with a stock list, and the menu paper for everyone else', () => {
    const page = code('features/services/pages/BusinessPage.tsx');
    expect(page).toMatch(/s\.catalogue\?\.kind === 'stock' && isGroceryTrade\(s\.categoryKey\)\s*\?\s*\(\s*<GroceryStore/);
    expect(page).toMatch(/<OrderMenu listingId/);
  });

  it('opens the one checkout the city has — imported, not copied', () => {
    const store = code('features/services/GroceryStore.tsx');
    expect(store).toMatch(/import \{ Checkout \} from '\.\/OrderMenu'/);
    expect(store).not.toMatch(/usePlaceOrder|useQuoteOrder/);
    expect(code('features/services/OrderMenu.tsx')).toMatch(/export function Checkout\(/);
  });

  it('prints the source under every photograph the shop did not take, and never a placeholder pack', () => {
    const store = code('features/services/GroceryStore.tsx');
    expect(store).toMatch(/item\.photoCredit && \(\s*<a className="gs-credit" href=\{item\.photoCredit\.url\}/);
    expect(store).toMatch(/<span className="gs-pic-empty" aria-hidden>\{item\.name\.slice\(0, 1\)\}<\/span>/);
    expect(store).not.toMatch(/placeholder\.(png|jpg|svg)|no-image/i);
  });

  it('keeps every word on green on the deep green, never the reference’s 2.5:1 mint-green', () => {
    const css = code('styles/grocery-store.css');
    // The pale green may only be a wash under a hover or a ring around a tile.
    const plain = [...css.matchAll(/^[^\n]*var\(--gs-green\)[^\n]*$/gm)].map((m) => m[0]);
    for (const line of plain) expect(line).toMatch(/border-color|box-shadow|gs-pic-empty/);
    expect(css).toMatch(/\.gs-place \{[^}]*background: var\(--gs-green-deep\)/);
    expect(css).toMatch(/\.gs-badge \{[^}]*background: var\(--gs-green-deep\)/);
  });

  it('is scoped and theme-blind like the menu paper, with its colours declared in tokens.css', () => {
    const tokens = read('styles/tokens.css');
    expect(tokens).toMatch(/\.gstore \{[^}]*--gs-green-deep: #17734b;/);
    const css = read('styles/grocery-store.css');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(read('main.tsx')).toMatch(/import '\.\/styles\/grocery-store\.css';/);
  });
});
