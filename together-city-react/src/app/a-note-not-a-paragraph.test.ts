import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const PAGE = 'features/dating/pages/DatingBrowse.tsx';
const copy = () => read(PAGE)
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/&mdash;/g, '—')
  .replace(/&middot;/g, '·')
  .replace(/&rsquo;/g, '’')
  .replace(/\s+/g, ' ');

const css = () => readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
const noteBlock = () => {
  const c = css();
  const at = c.indexOf('.dnote {');
  const end = c.indexOf('/* ── A BAND WITH NO WASH', at);
  return c.slice(at, end > at ? end : undefined);
};

/**
 * ── A NOTE, NOT A PARAGRAPH ─────────────────────────────────────────────────
 *
 * Owner, 23 Aug, with a piece of stationery for reference and three lines of
 * copy to replace the paragraph that stood at the top of Potential Matches.
 *
 * The owner also chose, from four drawn variants, the one that borrows no
 * typeface — so the whole card is General Sans, and the Dating Hub asks for no
 * grant in relief.spec.ts. That choice is a thing a later hand would undo
 * without knowing it was a choice, so it is written down here as an assertion
 * rather than a comment.
 */
describe('the matches note', () => {
  it('says the three lines it was given, and says them exactly', () => {
    const c = copy();
    expect(c).toMatch(/Stop investing your time in the wrong connections\./);
    expect(c).toMatch(/Discover your compatibility first\. Then start getting to know each other\./);
    expect(c).toMatch(/Because meaningful relationships should begin with intention/);
  });

  /**
   * THE ROOM HAS ONE NAME. The rail and config/hubs.ts call this Potential
   * Matches; a card headed "MATCHES." would be a room a citizen has to learn
   * twice. The two are read off each other here so they cannot drift.
   */
  it('is headed with the name the rail uses', () => {
    const label = /label: '([^']+)', sub: 'Everyone, with your %'/.exec(read('config/hubs.ts'))?.[1];
    expect(label).toBe('Potential Matches');
    expect(copy()).toMatch(new RegExp(`className="dnote-mark">${label}\\.</h1>`));
  });

  /**
   * ── THE TWO THINGS THE NEW COPY DOES NOT SAY ──────────────────────────────
   *
   * The paragraph this card replaced carried two facts about the room, and
   * nothing else on the site carries either: the list has no floor, and a like
   * is silent unless it is returned. The first is a real property of the
   * endpoint — `discover()` scores every eligible candidate with no truncation
   * and no floor — and the new headline, read quickly, suggests the opposite.
   *
   * They are set as the smallest thing on the card rather than deleted. If
   * they ever go, this assertion should be deleted deliberately and not
   * discovered missing.
   */
  it('still says nobody is hidden for scoring low', () => {
    expect(copy()).toMatch(/Nobody is hidden for scoring low/);
    // And the endpoint still behaves that way: no cap, no floor.
    expect(read(PAGE)).toMatch(/no truncation, no floor/);
  });

  it('still says a like is silent unless it is returned', () => {
    expect(copy()).toMatch(/Like someone and they hear nothing; like each other and you both do/);
  });

  /**
   * THE COUNT IS REAL AND IT WAITS. `everyone` is empty until discover
   * resolves, and "0 people" for a second is a small, plausible, disheartening
   * lie about somebody's whole city.
   */
  it('shows a count only once there is one', () => {
    expect(copy()).toMatch(/everyone\.length > 0 \? `\$\{everyone\.length\} people`/);
  });

  it('borrows no typeface — the owner picked the variant that does not', () => {
    expect(noteBlock()).not.toMatch(/font-family/);
    expect(copy()).not.toMatch(/press-serif|press-mono/);
  });

  it('is made of the hub’s own material, and invents no colour', () => {
    const b = noteBlock();
    expect(b).toMatch(/background: var\(--frost\)/);
    // relief.css argues at length that this hub is a sky with translucent
    // surfaces on it. The reference's cream paper would need a colour this
    // system does not have — and colour-literal-ceiling is at its ceiling.
    expect(b).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('adds no font size the system did not already have', () => {
    const have = new Set<string>();
    for (const m of css().replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/font-size:\s*([0-9.]+)px/g)) have.add(m[1]);
    for (const m of noteBlock().replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/font-size:\s*([0-9.]+)px/g)) {
      // Every size in the card must appear elsewhere in the stylesheet too —
      // i.e. the card introduced none of its own.
      const elsewhere = css().replace(noteBlock(), '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect({ size: m[1], usedElsewhere: new RegExp(`font-size:\\s*${m[1]}px`).test(elsewhere) })
        .toEqual({ size: m[1], usedElsewhere: true });
    }
    expect(have.size).toBeGreaterThan(0);
  });
});
