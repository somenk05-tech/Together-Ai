import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTitle, joinTitle } from '@/features/nutrition/recipeTitle';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(web, 'features', 'nutrition', 'pages', 'RecipeDetail.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

/**
 * A TITLE MAY BE SET DIFFERENTLY. IT MAY NOT BE CHANGED.
 *
 * The card sets most of a dish name in capitals and drops its last word onto a
 * line of its own. That is typesetting, and the whole risk in it is that it
 * stops being typesetting: a split that trims, drops or re-cases a word is a
 * page quietly renaming 4,000 dishes, and it would look completely intentional.
 *
 * So the property, not the examples: the two pieces joined by one space are the
 * name that came out of the database. Every case below is a shape this dataset
 * actually contains — Indian dish names run long and carry ampersands, hyphens,
 * brackets and non-Latin scripts.
 */
const NAMES = [
  'Potato And Hard Boiled Egg Curry',
  'Creamy Mushroom & Spinach Fettuccine',
  'Chicken Biryani',
  'Khichdi',
  'Dal',
  'Aloo Gobi Matar',
  'Palak Paneer (Restaurant Style)',
  'Ragi Mudde',
  'Kadhi Pakora — Punjabi',
  'Thakkali Rasam',
  'Egg Bhurji With Multigrain Toast And Avocado',
  'Idli-Sambar',
];

describe('setting a dish name as a card title', () => {
  it('never loses or adds a character', () => {
    for (const name of NAMES) {
      expect(joinTitle(setTitle(name))).toBe(name);
    }
  });

  it('leaves a short name whole rather than stranding one word above another', () => {
    expect(setTitle('Chicken Biryani')).toEqual({ lead: '', tail: 'Chicken Biryani' });
    expect(setTitle('Khichdi')).toEqual({ lead: '', tail: 'Khichdi' });
  });

  it('sets the last word apart once there is enough name to split', () => {
    expect(setTitle('Potato And Hard Boiled Egg Curry'))
      .toEqual({ lead: 'Potato And Hard Boiled Egg', tail: 'Curry' });
  });

  it('collapses stray whitespace rather than printing an empty piece', () => {
    // A name with a double space would otherwise split into a piece that is
    // the empty string, and the page would render a blank display line.
    expect(setTitle('  Aloo   Gobi  Matar ')).toEqual({ lead: 'Aloo Gobi', tail: 'Matar' });
    expect(setTitle('   ')).toEqual({ lead: '', tail: '' });
  });
});

/**
 * WHAT THE REDESIGN WAS NOT ALLOWED TO QUIETLY DROP.
 *
 * Nine cards became a printed card. That is a change of paper, and the way a
 * change of paper goes wrong is that a finding which did not fit the new layout
 * stops being printed — nobody deletes it on purpose, it just has nowhere to
 * go. These are the four that must survive any future pass over this page.
 */
describe('the recipe card still prints what it knows', () => {
  it('still warns when the dish itself is heavy', () => {
    expect(page).toMatch(/n\?\.complete && \(n\.sodiumMg > 700/);
    expect(page).toMatch(/higher in \{caution\}/);
  });

  it('still says when a nutrient is unknown instead of printing a zero', () => {
    expect(page).toMatch(/means we don’t yet have reliable data/);
    expect(page).toMatch(/Some values are estimated from recognised ingredients/);
  });

  it('still derives the headline claims rather than decorating with them', () => {
    // The lede under the title is where the printed references put a
    // copywriter's tagline. This one may only print earned badges, or plain
    // facts about the dish — never an adjective.
    expect(page).toMatch(/const lede = badges\.length > 0/);
    expect(page).toMatch(/\[meta\.label, r\.country, difficultyFor\(r\.minutes\)\]/);
  });

  it('keeps every section reachable from the index', () => {
    // A long page that lost its nav is the follow-peek failure again: a clean
    // diff where a door disappears.
    for (const id of ['card', 'nutrition', 'benefits', 'variants', 'foryou', 'grocery']) {
      expect(page).toMatch(new RegExp(`id="${id}"`));
      expect(page).toMatch(new RegExp(`\\['${id}',`));
    }
  });
});
