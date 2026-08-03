import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_ART, artFor } from '../features/astrology/cardArt';
import { DECK_SUITS } from '../features/astrology/deckSuits';

const here = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(here, '..', '..', 'public', 'assets', 'img', 'tarot');
const DECK_TS = join(here, '..', '..', '..', 'together-city-chat', 'src', 'astrology', 'tarot-deck.ts');

/**
 * The deck never claims art it does not have, and never hides art it does.
 *
 * Seventy-eight cards and seventy-eight illustrations. That is a nicer number
 * than the twenty-two this started at, and it makes the guard MORE useful
 * rather than less: while 56 cards were missing, a missing card was the normal
 * case and obvious. Now the next thing to go wrong is one file, and one broken
 * card among seventy-eight is the kind of thing nobody notices for a month.
 *
 * Checked in both directions on purpose. A list that names a missing file gives
 * a citizen a broken card; a file that no list names is art nobody can see —
 * the quieter failure, and the likelier one, because dropping an image into a
 * folder takes two seconds and remembering the module does not.
 *
 * And checked against the DECK, not against itself. The ids here have to be the
 * ids tarot-deck.ts assigns, or the art list is internally consistent and
 * useless.
 */
describe('the tarot art', () => {
  const files = existsSync(ART_DIR)
    ? readdirSync(ART_DIR).filter((f) => f.endsWith('.webp')).sort()
    : [];

  it('has a folder with cards in it (guards the test itself)', () => {
    expect(existsSync(ART_DIR), `no art folder at ${ART_DIR}`).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('every card it claims art for has a file', () => {
    const missing = [...CARD_ART].sort().filter((id) => !files.includes(`${id}.webp`));
    expect(missing, 'these would render as a broken image').toEqual([]);
  });

  it('every file it holds is claimed by a card', () => {
    const orphans = files.map((f) => f.replace(/\.webp$/, '')).filter((id) => !CARD_ART.has(id));
    expect(orphans, 'this art exists and nothing can show it').toEqual([]);
  });

  it('covers the whole deck: 22 majors and 14 of each suit', () => {
    for (let n = 0; n <= 21; n++) expect(CARD_ART.has(`major-${n}`), `major-${n}`).toBe(true);
    for (const suit of DECK_SUITS) {
      for (let n = 1; n <= 14; n++) expect(CARD_ART.has(`${suit}-${n}`), `${suit}-${n}`).toBe(true);
    }
    expect(CARD_ART.size).toBe(78);
  });

  it('uses the ids the deck actually assigns', () => {
    // The API is the authority on what a card is called. If this test wrote its
    // own id format it would agree with itself for ever and with nothing else.
    const deck = readFileSync(DECK_TS, 'utf8');
    expect(deck).toContain('id: `major-${num}`');
    expect(deck).toContain('id: `${suit}-${num}`');
    for (const suit of DECK_SUITS) expect(deck).toContain(`${suit}: {`);
  });

  it('resolves a path for a card it has, and null for one it does not', () => {
    expect(artFor('major-0')).toBe('/assets/img/tarot/major-0.webp');
    expect(artFor('pentacles-14')).toBe('/assets/img/tarot/pentacles-14.webp');
    expect(artFor('minor-cups-3')).toBeNull();   // not how the deck names them
    expect(artFor('wands-15')).toBeNull();       // not a card
    expect(artFor('not-a-card')).toBeNull();
  });
});
