import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const API = join(APP, '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const api = (p: string) => readFileSync(join(API, p), 'utf8');

const PAGE = 'features/astrology/pages/AstroGemstones.tsx';
const copy = () => read(PAGE)
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/&mdash;/g, '—')
  .replace(/&rsquo;/g, '’')
  .replace(/\s+/g, ' ');

/**
 * ── THE GEMSTONE MASTHEAD CLAIMS WHAT THE ROOM DOES ─────────────────────────
 *
 * Owner, 23 Aug, with a photograph of a field of jewelled flowers: give this
 * room the band the other two have.
 *
 * The words are the lede the page already carried, broken at its own em-dash so
 * it can be a large line and a small one. Not a word is added or dropped — but
 * a sentence read at 40px is a promise in a way a grey lede is not, and this
 * one makes three checkable claims about what the page shows. Each is tied here
 * to the line that earns it.
 */
describe('the gemstone masthead claims what the room does', () => {
  it('says only the stones your chart calls for, and the list is read from the chart', () => {
    expect(copy()).toMatch(/Only the stones your own chart calls for/);
    // The page has no catalogue of its own: every stone on it arrives in the
    // recommendation payload, and the payload is refused without a birth
    // profile. A shop would fail both of these.
    expect(copy()).toMatch(/needsProfile/);
    expect(copy()).toMatch(/<NeedsProfileCard \/>/);
    expect(api('astrology/astrology.service.ts')).toMatch(/recommendGems\(/);
  });

  it('says what each one is for, and the page prints every reason', () => {
    // Lower-cased 6 Sep with the picture: the masthead had split the lede at
    // its dash and capitalised the half that became the small line. The dash
    // is back, so the word is mid-sentence again — the same words either way.
    expect(copy()).toMatch(/what each one is for/i);
    // The stone came up for a reason — the ascendant, the ninth lord, the
    // running dasha — and the page prints all of them rather than asserting a
    // fit. A stone with no reason on it would be a shop pretending to be a
    // reading.
    expect(copy()).toMatch(/rec\.reasons\.map/);
    expect(api('astrology/gems/gem-recommend.ts')).toMatch(/reasons: string\[\]/);
  });

  /**
   * The claim easiest to leave behind. The finger is not decoration — it is
   * part of the remedy — and it is the one line here that would quietly stop
   * being true if the payload were ever trimmed.
   */
  it('says which finger it is worn on, and the page prints the finger', () => {
    expect(copy()).toMatch(/which finger it is worn on/);
    expect(copy()).toMatch(/label="Finger" value=\{wearing\.finger\}/);
    // One table, named per planet — not prose the reader has to mine.
    expect(api('astrology/gems/wearing.ts')).toMatch(/finger: string;/);
    expect(api('astrology/gems/wearing.ts')).toMatch(/sun: \{[^}]*finger: '/);
  });

  it('says what it costs, and the price shown is the one at the stone’s weight', () => {
    expect(copy()).toMatch(/what it costs/);
    // A price per carat is not a price. The page prints the range AT THIS
    // WEIGHT, which is the only number anybody can act on.
    expect(copy()).toMatch(/AT THIS WEIGHT/);
    expect(copy()).toMatch(/rupees\(rec\.fromInr/);
    expect(read('features/astrology/api.ts')).toMatch(/fromInr: number \| null;/);
  });

  it('puts no uncounted scale claim on this page either', () => {
    const c = copy();
    expect(c).not.toMatch(/billions?|millions?|trillions?/i);
    expect(c).not.toMatch(/data points/i);
  });
});

describe('the gemstone header', () => {
  /**
   * THE PICTURE IS GONE — owner, 6 Sep: "remove the gemstone image."
   *
   * This room had a masthead of its own: a photograph of a jewelled field,
   * the words on the bright half of it, no wash, and a scrim shadow under
   * every line to buy back what the wash was buying. It opens on the shared
   * header now, like the other five screens in the zone.
   *
   * WHAT THIS BLOCK IS FOR, STILL. The rule it was written to protect has not
   * changed: no page in this zone brings masthead rules of its own. It is
   * asserted from the other side now — this room has no band at all.
   */
  it('opens on the header five other screens share', () => {
    expect(read(PAGE)).toMatch(/^import .*AstroHeader/m);
    expect(copy()).toMatch(/<AstroHeader/);
    expect(copy()).not.toMatch(/className="astra/);
    expect(copy()).not.toMatch(/gem-field/);
  });

  it('brings no masthead rules of its own, and takes its own away with it', () => {
    const css = readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
    expect(css).not.toMatch(/\.gem-astra|\.gem-masthead|\.gem-band/);
    expect((css.match(/^\.astra \{/gm) ?? []).length).toBe(1);
    // A rule nobody wears is a rule that comes back on the next page that
    // half-remembers it. Both were this room's alone.
    // The RULES, not the mentions — the comment that replaced them names both
    // so the next person knows where they went.
    expect(css).not.toMatch(/^\.astra\.is-clear/m);
    expect(css).not.toMatch(/^\.astra\.has-tabs/m);
  });

  /**
   * NOT ONE WORD MOVED, EITHER WAY. The band split the lede at its own dash
   * because a masthead needs a large line and a small one. Nothing here does,
   * so the dash is back and the sentence is the sentence it was written as.
   */
  it('says exactly what the lede said, whole', () => {
    expect(copy()).toMatch(
      /Only the stones your own chart calls for — what each one is for, which finger it is worn on, and what it costs\./,
    );
  });

  it('leaves the band alone in the two rooms that still draw one', () => {
    const css = readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
    // The shared veil is untouched: still a gradient, still clearing at 60%.
    expect(css).toMatch(/\.astra-veil \{[\s\S]{0,600}?linear-gradient\(96deg/);
    for (const page of ['AstroAsk', 'AstroTarot']) {
      expect(read(`features/astrology/pages/${page}.tsx`)).toMatch(/className="astra-veil"/);
    }
  });
});
