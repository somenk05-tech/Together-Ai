import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
    expect(copy()).toMatch(/What each one is for/);
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

describe('the gemstone band', () => {
  /**
   * THREE ROOMS, ONE BLOCK. The whole point of reusing `.astra-*` is that the
   * mastheads in this zone cannot drift apart, so the test that matters is that
   * no page brings masthead rules of its own.
   */
  it('is the third room on the same block, not a third copy of it', () => {
    expect(copy()).toMatch(/<header className="astra has-tabs">/);
    const css = readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
    expect(css).not.toMatch(/\.gem-astra|\.gem-masthead|\.gem-band/);
    expect((css.match(/^\.astra \{/gm) ?? []).length).toBe(1);
    // The one rule this room did add: air under the band, because the tab row
    // sits directly beneath it and the header it replaced carried 18px.
    expect(css).toMatch(/\.astra\.has-tabs \{ margin-bottom: 18px; \}/);
  });

  it('no longer draws the header five other screens share', () => {
    expect(read(PAGE)).not.toMatch(/^import .*AstroHeader/m);
    expect(copy()).not.toMatch(/<AstroHeader/);
  });

  /**
   * NOT ONE WORD MOVED. The lede is broken at its dash and nothing else — this
   * asserts every word of the original survives, in order, across the break.
   */
  it('says exactly what the lede said, split at its own dash', () => {
    const c = copy();
    const lead = /Only the stones your own chart calls for\./.test(c);
    const body = /What each one is for, which finger it is worn on, and what it costs\./.test(c);
    expect({ lead, body }).toEqual({ lead: true, body: true });
  });

  it('ships the photograph it draws, at the weight of a masthead', () => {
    const file = join(APP, 'public/assets/img/gem-field.webp');
    expect(existsSync(file)).toBe(true);
    expect(Math.round(statSync(file).size / 1024)).toBeLessThanOrEqual(120);
    expect(copy()).toMatch(/className="astra-sky"[^>]*alt=""/);
  });
});
