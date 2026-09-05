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

  /**
   * THE WEARERS MOVED, 26 Aug, with the owner's full-bleed reference: the
   * browse card now shows only the photograph and four facts, so both lists
   * live on the profile — the page where the decision to meet a stranger is
   * actually made. Same classes, same one-token difference; what this file
   * exists to stop (a third inline copy) is still stopped, because the pattern
   * still has a name and its wearers still wear it.
   */
  it('both lists wear it, and neither carries an inline style any more', () => {
    const d = read('features/dating/pages/DatingMatchDetail.tsx');
    expect(d).toMatch(/<div className="dt-why">One thing to explore<\/div>/);
    expect(d).toMatch(/<ul className="dt-reasons">/);
    expect(d).toMatch(/<ul className="dt-reasons is-friction">/);
    // The <li> carried a marginBottom each. The rule carries it now.
    expect(d).not.toMatch(/<li key=\{i\} style=/);
    // And the card upstairs stopped wearing it rather than forking it.
    const m = read('features/dating/components/MatchCards.tsx');
    expect(m).not.toMatch(/dt-reasons/);
  });

  it('the one-line version wears the same idea where it still speaks', () => {
    // The match-detail compat panel that carried a dt-note is gone with the
    // 26 Aug redraw; Curated Matches still speaks in it, so the class and its
    // 600-weight strong stay named once in the stylesheet.
    const m = read('features/dating/pages/DatingMatches.tsx');
    expect(m).toMatch(/<p className="dt-note">/);
    expect(css()).toMatch(/\.dt-note strong \{ font-weight: 600; \}/);
  });

  /**
   * AND THE CEILING WENT DOWN, NOT UP. Eight inline objects and six spacing
   * values left; the ceiling follows them, because a ratchet that only ever
   * holds is a ratchet that never tightens.
   */
  it('lowered the ceiling to what is actually there', () => {
    const s = read('../scripts/size-system-ceiling.mjs');
    // Lowered 23 Aug night with the neumorphic re-cut, again 24 Aug when the
    // menu paper landed its components in classes, and once more the same day
    // when the business card's verbs and the gallery's hero took classes too —
    // a ratchet below its ceiling is slack.
    //
    // And again 28 Aug, when `distinctFontSizes` was brought back under after
    // reading OVER on every run. All four lines came down to that day's
    // readings at once, which is what the script asks for on every green run
    // and what nobody had done while one metric kept the whole thing red.
    //
    // And again 1 Sep. `inlineStyleBlocks` had been fifty over since b1edab9a
    // and red on every run since — the launch gate listed it as blocking. 57 of
    // those objects were one declaration, `{ flex: 1, minWidth: 0 }`, which is
    // now the `.flex-min` class; four more restated `.tag`'s own font size.
    //
    // And 2 Sep, two lower: the services search field (five objects, one
    // commit after the 1 Sep lowering) and a third spacer on /profile had put
    // it six OVER at HEAD without anybody's landing script noticing. Both took
    // classes; the ceiling follows the reading, as it says to on every run.
    // And 2 Sep, evening, one lower: the wallet page stopped drawing a button
    // that minted a card (launch blocker 2) and lost a style object with it.
    // And 4 Sep, with Social Life's first fix pass: the Saved page came off
    // its hand-styled localStorage list onto the server, the dead `wall-open`
    // branch went, and the reorder chip took a token radius. 6678 → 6547,
    // 3605 → 3541, 317 → 315 — each the reading the script printed that
    // morning, none of them chosen.
    // And 4 Sep, the launch gate's third reading: the Medical supplement page
    // stopped drawing an inline "add a panel" link inside a plan it no longer
    // shows without one (no blood test, no plan). 6547 → 6546.
    // And again the same evening: the unverified-email banner's style was
    // hoisted so the socket's reconnect strip could wear it. 6546 → 6545,
    // 3541 → 3540.
    expect(s).toMatch(/inlineStyleBlocks: 6545,/);
    expect(s).toMatch(/rawSpacing: 3540,/);
    // The two the script prints beside them, pinned for the same reason: a
    // number nothing reads is a number that drifts back up.
    expect(s).toMatch(/distinctFontSizes: 35,/);
    expect(s).toMatch(/rawRadii: 315,/);
  });
});
