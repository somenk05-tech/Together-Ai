import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const css = () => read('styles/layout.css');

/**
 * ── THE FRICTION LIST TAKES A CLASS ─────────────────────────────────────────
 *
 * "Why this match?" had a small bold label over a tight bulleted list, built
 * from three inline style objects. On 23 Aug the deal-breaker work added "One
 * thing to explore" by copying it — which is the moment a pattern stops being
 * an arrangement and becomes a thing with a name.
 *
 * THE CEILING CAUGHT IT, WHICH IS WHY THIS FILE EXISTS AT ALL. That commit
 * took `inline style objects` from 6793 to 6798 and `raw inline spacing` from
 * 3688 to 3691, and the next thing anybody tried to land failed on it. The fix
 * is a class rather than a higher number — size-system-ceiling.mjs says in its
 * own header "never raise one to make a build pass".
 *
 * These assertions are what stops the third copy. A rule with two wearers and
 * no test is a rule somebody re-inlines the day they add the third.
 */
describe('the friction list takes a class', () => {
  it('names the pattern once, and the two wearers differ by one token', () => {
    const c = css();
    expect(c).toMatch(/^\.dt-why \{/m);
    expect(c).toMatch(/^\.dt-reasons \{/m);
    expect(c).toMatch(/\.dt-reasons\.is-friction \{ color: var\(--muted\) \}|\.dt-reasons\.is-friction \{ color: var\(--muted\); \}/);
    // the case for the match, and the caveat on it
    const block = c.slice(c.indexOf('.dt-reasons {'), c.indexOf('.dt-note'));
    expect(block).toMatch(/color: var\(--ink-soft\)/);
  });

  it('both lists wear it, and neither carries an inline style any more', () => {
    const m = read('features/dating/components/MatchCards.tsx');
    expect(m).toMatch(/<div className="dt-why">Why this match\?<\/div>/);
    expect(m).toMatch(/<div className="dt-why">One thing to explore<\/div>/);
    expect(m).toMatch(/<ul className="dt-reasons">/);
    expect(m).toMatch(/<ul className="dt-reasons is-friction">/);
    // The <li> carried a marginBottom each. The rule carries it now.
    expect(m).not.toMatch(/<li key=\{i\} style=/);
  });

  it('the panel’s one-line version wears the same idea', () => {
    const d = read('features/dating/pages/DatingMatchDetail.tsx');
    expect(d).toMatch(/<p className="dt-note">/);
    // A <strong> is 700 by default and this one wants 600 — the entire reason
    // the inline object existed. The rule says it once.
    expect(d).not.toMatch(/<strong style=\{\{ fontWeight: 600 \}\}>One thing/);
    expect(css()).toMatch(/\.dt-note strong \{ font-weight: 600; \}/);
  });

  /**
   * AND THE CEILING WENT DOWN, NOT UP. Eight inline objects and six spacing
   * values left; the ceiling follows them, because a ratchet that only ever
   * holds is a ratchet that never tightens.
   */
  it('lowered the ceiling to what is actually there', () => {
    const s = read('../scripts/size-system-ceiling.mjs');
    // Lowered 23 Aug night with the neumorphic re-cut — the tree had drifted
    // one below on both counts, and a ratchet below its ceiling is slack.
    expect(s).toMatch(/inlineStyleBlocks: 6789,/);
    expect(s).toMatch(/rawSpacing: 3684,/);
  });
});
