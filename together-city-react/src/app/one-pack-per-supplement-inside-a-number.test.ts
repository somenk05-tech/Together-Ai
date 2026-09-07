import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * ── ONE PACK PER SUPPLEMENT, INSIDE A NUMBER THE CITIZEN SET (owner, 5 Sep) ──
 * "supplements show only one option for supplement based on budget — let user
 * set budget." The Personalized Store's supplement shelf drew every product
 * under every shortlisted supplement. It draws the server's kit now, and
 * carries the one control that decides it.
 */
describe('the supplement shop is a kit, not a catalogue', () => {
  const adapter = read('features/ecommerce/store/useFitnessShop.ts');
  const front = read('features/ecommerce/store/StoreFront.tsx');
  const types = read('features/ecommerce/store/types.ts');
  const api = read('api/store.api.ts');

  it('draws the kit’s picks in the kit’s order, and falls back to the whole shortlist only when no kit came', () => {
    expect(adapter).toMatch(/kit\.picks\.map\(\(k\) => byId\.get\(k\.productId\)\)/);
    expect(adapter).toMatch(/if \(!kit\) return sellable\.map\(shopItem\)/);
  });

  it('the arithmetic is the server’s: the adapter never picks by price and sends the number back whole', () => {
    expect(adapter).not.toMatch(/priceInr\s*[<>]/);
    expect(adapter).toMatch(/onChange: \(v: number \| null\) => setBudget\.mutate\(v\)/);
    expect(api).toMatch(/apiPut\('\/fitness\/store\/budget', \{ monthlyInr \}/);
    expect(api).toMatch(/invalidateQueries\(\{ queryKey: \['fitness', 'store'\] \}\)/);
  });

  it('the shell knows a number, a total and a list of names — and nothing about packs', () => {
    expect(types).toMatch(/export interface ShopBudget \{/);
    expect(types).toMatch(/budget\?: ShopBudget;/);
    expect(front).toMatch(/function BudgetBar\(/);
    expect(front).not.toMatch(/omega|supplement|month’s supply/i);
  });

  it('the control is drawn before the shelf and even when the shelf is empty, with a Clear that means no cap', () => {
    const bar = front.indexOf('{shop.budget && <BudgetBar');
    const grid = front.indexOf('{shop.items.length === 0 ?');
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(grid);
    expect(front).toMatch(/onClick=\{\(\) => budget\.onChange\(null\)\}/);
    // A draft on the way to a number is never saved as the number.
    expect(front).toMatch(/const \[draft, setDraft\]/);
    expect(front).toMatch(/onBlur=\{commit\}/);
  });

  it('what the number could not reach is named, and an empty kit says why', () => {
    expect(adapter).toMatch(/back in from ₹/);
    expect(adapter).toMatch(/Your number reaches nothing yet/);
    expect(front).toMatch(/aria-label="Not in your kit at this number"/);
  });

  it('the Fitness shelf marks the same pick, and the styles are classes, not new inline objects', () => {
    const hub = read('features/fitness/pages/Supplements.tsx');
    expect(hub).toMatch(/store\.data\?\.kit\?\.picks/);
    expect(hub).toMatch(/'Your pick'/);
    expect(hub).toMatch(/to="\/ecommerce\/shop\/supplements"/);
    const css = read('styles/layout.css');
    expect(css).toMatch(/\.st-budget-input \{/);
    // The one pre-existing inline object in StoreFront is not this feature's; BudgetBar adds none.
    const bar = front.slice(front.indexOf('function BudgetBar('), front.indexOf('export function StoreFront('));
    expect(bar).not.toMatch(/style=\{\{/);
  });
});
