import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(APP, 'src/styles/relief.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * A CLASS CARRIES NO HEIGHT THE SCANNER CAN READ.
 *
 * The tap-target sweep fixed twenty-three call sites that stated a height in an
 * inline style. It could not see `.btn-sm` (35px), `.btn-icon.btn-sm` (35×35),
 * `.pill` and `.chip` (33px) or `.g-key.sm` (38px), because those heights live
 * in a stylesheet — which is also why `a11y-audit` reports zero for them and
 * why the ceiling is a false green on exactly this rule.
 *
 * The fix is a transparent centred pseudo-element at 44×44, so the TARGET meets
 * the standard and the paint does not change. Growing the paint would redraw
 * the filter rows, the chip trays and the day strip, all of which are built on
 * the proportions of a 33px key.
 *
 * This is the guard, because the failure mode is silent: somebody removes the
 * ::after while tidying, nothing looks different, and the targets quietly go
 * back to 33px.
 */
describe('every small control has a 44px target', () => {
  const SMALL = ['.btn-sm', '.btn-icon.btn-sm', '.pill', '.chip', '.g-key.sm'];

  it('gives each of them a hit area', () => {
    const block = css.slice(css.indexOf('.btn-sm::after'));
    for (const sel of SMALL) {
      expect(css).toMatch(new RegExp(`${sel.replace(/[.]/g, '\\.')}::after`));
    }
    expect(block).toMatch(/min-width:\s*44px/);
    expect(block).toMatch(/min-height:\s*44px/);
  });

  it('positions the hit area out of flow, so nothing reflows', () => {
    const rule = css.slice(css.indexOf('.btn-sm::after'), css.indexOf('.tag::after'));
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/transform:\s*translate\(-50%, -50%\)/);
    // …and the elements it hangs off are positioned, or `absolute` would
    // resolve against some ancestor and land anywhere.
    expect(css).toMatch(/\.btn-sm, \.btn-icon\.btn-sm, \.pill, \.chip, \.g-key\.sm \{ position: relative; \}/);
  });

  it('keeps the hit area behind the label', () => {
    // Over the content it would swallow a click meant for a child.
    const rule = css.slice(css.indexOf('.btn-sm::after'), css.indexOf('.tag::after'));
    expect(rule).toMatch(/z-index:\s*0/);
  });

  it('gives a decorative tag no target at all', () => {
    // `.tag` shares a rule block with `.pill`, and it is a label: a press does
    // nothing, so a 44px target for it would be a lie about what it is.
    expect(css).toMatch(/\.tag::after \{ content: none; \}/);
  });

  it('has not quietly enlarged the controls themselves', () => {
    // If somebody "fixes" this by growing the paint instead, the design changes
    // everywhere and this test should be the thing that says so.
    expect(css).toMatch(/\.btn-sm \{ height: 35px/);
    // EITHER SPELLING OF THE SAME SIZE. --fs-3 IS 12.5px; the type scale landed
    // and 287 CSS declarations were pointed at it, so an assertion that pinned
    // the digits was reading the spelling rather than the size. Second one of
    // these in this sweep — a value-preserving codemod is exactly what catches
    // a guard that names a literal instead of an intent.
    expect(css).toMatch(/\.pill, \.chip \{ font-size: (?:12\.5px|var\(--fs-3\)); height: 33px/);
  });
});
