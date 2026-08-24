import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const API = join(APP, '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const api = (p: string) => readFileSync(join(API, p), 'utf8');

/**
 * The page with its comments stripped and its whitespace collapsed — the same
 * instrument the consultation room's masthead test uses, and for the same
 * reason: a comment is not copy on a screen, and JSX breaks a sentence
 * wherever the indentation falls.
 */
const copy = () => read('features/astrology/pages/AstroTarot.tsx')
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/&mdash;/g, '—')
  .replace(/&rsquo;/g, '’')
  .replace(/\s+/g, ' ');

/**
 * ── THE TAROT MASTHEAD CLAIMS WHAT THE TABLE DOES ───────────────────────────
 *
 * Owner, 23 Aug: give Tarot the consultation room's band. The words are the
 * ones the page already carried in its `AstroHeader` lede, so nothing here is a
 * new claim — but they are about to be set at masthead size, and a sentence
 * read at 40px is a promise in a way the same sentence in a grey lede is not.
 *
 * One of the lines is a claim about our own software rather than atmosphere:
 * "nothing is dealt until you have turned every card". (The masthead's second
 * claim, "the same draw can be regenerated from its seed", was retired in the
 * 24 Aug copy audit — the mechanism is still asserted below.) Each claim is
 * tied here to the line that earns it, so if the draw ever fires before the
 * last back turns, or a reading stops carrying its seed, this file goes red
 * rather than the masthead quietly becoming untrue.
 */
describe('the tarot masthead claims what the table does', () => {
  it('offers a free card a day, and the daily draw is priced at zero', () => {
    expect(copy()).toMatch(/A card a day, free/);
    expect(api('astrology/tarot.service.ts')).toMatch(/kind: 'daily'[\s\S]{0,120}priceInr: 0/);
  });

  it('says you turn the spread yourself, and the table is a row of face-down backs', () => {
    expect(copy()).toMatch(/turn a full spread yourself/);
    expect(copy()).toMatch(/className=\{`tarot-pick/);
  });

  /**
   * THE ASSERTION THIS FILE EXISTS FOR. `turn()` adds the card to `picks` and
   * returns early while `next.length < need`; the mutation is on the far side
   * of that guard. Nothing leaves the browser — and so nothing is dealt and
   * nothing is charged — until the last back is turned.
   */
  it('deals nothing until every card is turned, and the guard is above the request', () => {
    expect(copy()).toMatch(/Nothing is dealt until you have turned every card/);
    const page = read('features/astrology/pages/AstroTarot.tsx');
    const from = page.indexOf('const turn = (i: number)');
    const turn = page.slice(from, page.indexOf('\n  };', from));
    const guard = turn.indexOf('if (next.length < need) return;');
    const deal = turn.indexOf('draw.mutate(');
    expect(guard).toBeGreaterThan(-1);
    expect(deal).toBeGreaterThan(guard);
  });

  it('stores the seed with a reading and composes from it', () => {
    // The masthead no longer advertises reproducibility (copy audit, 24 Aug) —
    // the mechanism stays: the seed is stored and every read composes from it.
    const svc = api('astrology/tarot.service.ts');
    expect(svc).toMatch(/create: \{[^}]*seed,/);
    expect(svc).toMatch(/composeTarot\('daily', hit\.seed\)/);
    // Pure and deterministic on the seed — otherwise "regenerated" is a wish.
    expect(api('astrology/tarot-content.ts')).toMatch(/const rng = mulberry32\(hashSeed\(/);
  });

  it('puts no uncounted scale claim on this page either', () => {
    const c = copy();
    expect(c).not.toMatch(/billions?|millions?|trillions?/i);
    expect(c).not.toMatch(/data points/i);
  });
});

describe('the tarot band', () => {
  /**
   * ONE BLOCK, TWO ROOMS. The point of reusing `.astra-*` is that the two
   * mastheads in this hub cannot drift apart. A second block here — however
   * named — would be the drift, so the test is that this page brings no
   * masthead rules of its own.
   */
  it('reuses the consultation room’s band rather than copying it', () => {
    expect(copy()).toMatch(/<header className="astra">/);
    const css = readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
    expect(css).not.toMatch(/\.tarot-astra|\.tarot-masthead|\.tarot-band/);
    // Exactly one `.astra {` rule in the stylesheet, not two.
    expect((css.match(/^\.astra \{/gm) ?? []).length).toBe(1);
  });

  it('no longer draws the header six other screens share', () => {
    // The comment above the band names it; what matters is that nothing
    // imports it and nothing renders it.
    expect(read('features/astrology/pages/AstroTarot.tsx')).not.toMatch(/^import .*AstroHeader/m);
    expect(copy()).not.toMatch(/<AstroHeader/);
  });

  it('ships the spread it draws, at the weight of a masthead', () => {
    const file = join(APP, 'public/assets/img/tarot-spread.webp');
    expect(existsSync(file)).toBe(true);
    expect(Math.round(statSync(file).size / 1024)).toBeLessThanOrEqual(110);
    expect(copy()).toMatch(/className="astra-sky"[^>]*alt=""/);
  });
});
