import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_ART, artFor } from '../features/astrology/cardArt';

const here = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(here, '..', '..', 'public', 'assets', 'img', 'tarot');

/**
 * The deck never claims art it does not have, and never hides art it does.
 *
 * There are 78 cards and 22 illustrations. A card with no art falls back to the
 * typographic face it always had — which reads as a design, not as a fault —
 * and the ONLY thing standing between that and a page of broken image icons is
 * this list agreeing with that folder.
 *
 * Checked in both directions on purpose. A list that names a missing file gives
 * the citizen a broken card; a file that no list names is art nobody can see.
 * The second is the quieter failure and the likelier one — an image dropped in
 * a folder is a two-second job, and remembering the module is not.
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
    const claimed = [...CARD_ART].sort();
    const missing = claimed.filter((id) => !files.includes(`${id}.webp`));
    expect(missing, 'these would render as a broken image').toEqual([]);
  });

  it('every file it holds is claimed by a card', () => {
    const ids = files.map((f) => f.replace(/\.webp$/, ''));
    const orphans = ids.filter((id) => !CARD_ART.has(id));
    expect(orphans, 'this art exists and nothing can show it').toEqual([]);
  });

  it('covers the whole Major Arcana and says nothing about the Minors', () => {
    // 0-21 inclusive, which is the Majors and exactly the Majors. The Minors
    // are absent on purpose and the count is here so that stays deliberate:
    // if somebody adds Wands without adding the ids, the other two tests catch
    // it; if they add the ids without the files, this one still reads 22 and
    // the second test catches that.
    for (let n = 0; n <= 21; n++) expect(CARD_ART.has(`major-${n}`)).toBe(true);
    expect(CARD_ART.size).toBe(22);
    expect([...CARD_ART].filter((id) => id.startsWith('minor-'))).toEqual([]);
  });

  it('resolves a path for a card it has, and null for one it does not', () => {
    expect(artFor('major-0')).toBe('/assets/img/tarot/major-0.webp');
    expect(artFor('minor-cups-3')).toBeNull();
    expect(artFor('not-a-card')).toBeNull();
  });
});
