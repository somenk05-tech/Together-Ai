import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE WALK IS A ROW OF CARDS — owner, 6 Sep, with a card reference: "redesign
 * walk the districts in this reference, 3 in one row."
 *
 * It was fourteen commissioned billboards at their own height, one to a row:
 * twelve thousand pixels of scroll to see a city that fits on one screen, and
 * every plate carrying an "Explore ___" pill that said the district's name a
 * second time. The reference is a card — a photograph inset on white paper, a
 * small tracked label, one sentence in two weights — and three of them fit
 * across a row.
 */
describe('walk the districts', () => {
  const home = code('pages/Home.tsx');
  const relief = read('styles/relief.css');

  it('lays the districts out three to a row', () => {
    const at = relief.indexOf('.district-run {');
    const run = relief.slice(at, relief.indexOf('}', at));
    expect(run).toMatch(/display: grid/);
    expect(run).toMatch(/grid-template-columns: repeat\(3, 1fr\)/);
    // And it is a card, not the billboard plate it replaced.
    expect(home).toMatch(/className="district-card"/);
    expect(home).not.toMatch(/district-plate|hub-plate/);
  });

  it('insets the picture so the card\'s own paper shows around it', () => {
    // The whole difference between a card with a picture on it and a picture
    // with a card behind it. Full-bleed art makes the picture the card.
    const at = relief.indexOf('.district-card {');
    const card = relief.slice(at, relief.indexOf('}', at));
    expect(card).toMatch(/padding: clamp/);
    expect(card).toMatch(/background: var\(--paper\)/);
    expect(relief).toMatch(/\.district-card-art \{[^}]*border-radius/);
  });

  it('never crops a billboard, because the art has words painted in it', () => {
    /**
     * A 16:10 box was tried first and `cover` took the sides off every plate —
     * "Talk to ASTRA" arrived as "alk to ASTRA". The box is the tile's own
     * 560x239, so nothing is cropped at all.
     */
    expect(relief).toMatch(/\.district-card-art \{[^}]*aspect-ratio: 560 \/ 239/);
  });

  it('sends the row the tile, not the plate', () => {
    // Three to a row is ~380px across. The billboard art is 1800px and 200KB;
    // the tile is under 40, and every district panel has one.
    expect(home).toMatch(/-tile\.webp/);
    const panels = read('pages/Home.tsx').slice(read('pages/Home.tsx').indexOf('const PANELS: Panel[] = ['));
    const imgs = [...panels.slice(0, panels.indexOf('];')).matchAll(/img: '([^']+\.webp)'/g)].map((m) => m[1]);
    expect(imgs.length).toBeGreaterThan(10);
    const problems: string[] = [];
    for (const src of imgs) {
      const tile = src.replace(/\.webp$/, '-tile.webp');
      const path = join(APP, 'public/assets/img', tile);
      if (!existsSync(path)) { problems.push(`missing ${tile}`); continue; }
      const kb = Math.round(statSync(path).size / 1024);
      if (kb > 40) problems.push(`${tile} is ${kb} KB — a tile, not a plate`);
    }
    expect(problems).toEqual([]);
  });

  it('says the district\'s name once, and drops the pill that said it twice', () => {
    // The name is the card's label AND the link's accessible name. "Explore
    // Astrology" existed to give the link a name when the plate was a bare
    // photograph; the card has a label on it now.
    expect(home).toMatch(/className="district-card-name"/);
    expect(home).not.toMatch(/Explore <i>/);
  });

  it('sets the sentence in the reference\'s two weights', () => {
    // The setup steps back, the payoff is the ink — which is what makes a
    // two-line caption read as a caption rather than a paragraph.
    expect(home).toMatch(/splitDistrictLine/);
    expect(home).toMatch(/className="district-card-lead"/);
    expect(relief).toMatch(/\.district-card-lead \{[^}]*color: var\(--muted\)/);
  });

  it('leaves the hub landing its billboard', () => {
    // `.hub-plate` was always right for a threshold you arrive at on purpose,
    // and nothing here touched it.
    expect(relief).toMatch(/^\.hub-plate \{/m);
    expect(code('pages/HubLanding.tsx')).toMatch(/hub-plate/);
  });
});
