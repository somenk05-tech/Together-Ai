/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { readFileSync } from 'fs';
import { join } from 'path';
import { BEAUTY_PRODUCTS } from './beauty-engine';

/**
 * THE SHELF SAYS WHAT IT WAS CHECKED AGAINST (5 Sep). The allergy and
 * condition cuts read actives, the key ingredient and the label list — and
 * the label list is empty on every row of the catalogue as it stands, so a
 * declared fragrance allergy screened a shelf for nothing of the kind while
 * the shelf looked screened. The response now carries the coverage and the
 * sentence, computed from the catalogue rather than asserted.
 */
describe('label coverage', () => {
  const withLabel = BEAUTY_PRODUCTS.filter((p) => (p.ingredients?.length ?? 0) > 0).length;
  it('is computed from the catalogue in the products response', () => {
    const svc = readFileSync(join(__dirname, 'beauty.service.ts'), 'utf8');
    expect(svc).toMatch(/labelCoverage: \(\(\) => \{/);
    expect(svc).toMatch(/BEAUTY_PRODUCTS\.filter\(\(p\) => \(p\.ingredients\?\.length \?\? 0\) > 0\)\.length/);
    expect(svc).toMatch(/Read the pack before you use anything you react to\./);
  });
  it('the catalogue today has fewer labels than products, so the sentence is drawn', () => {
    // When this flips — every product carries its INCI list — the note goes
    // null on its own and this assertion should be retired with it.
    expect(withLabel).toBeLessThan(BEAUTY_PRODUCTS.length);
  });
  it('the web shelf draws it before the products, and searches the label list', () => {
    const market = readFileSync(join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'beauty', 'pages', 'Market.tsx'), 'utf8');
    expect(market).toMatch(/products\.data\.labelCoverage\?\.note/);
    expect(market).toMatch(/\(p\.ingredients \?\? \[\]\)\.join\(' '\)/);
  });
});
