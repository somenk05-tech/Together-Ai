import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FITTED, OPEN, fittedShelves, openShelves } from '@/features/ecommerce/shelves';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const img = (f: string) => join(APP, 'public/assets/img', f);

/** The same three-branch WebP header read `relief.spec` uses for the tarot deck. */
function size(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  const tag = b.subarray(12, 16).toString('latin1');
  if (tag === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (tag === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  const n = b.readUInt32LE(21);
  return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
}

/**
 * ── THE CARD IS THE PICTURE ─────────────────────────────────────────────────
 *
 * Owner, 22 Aug: "use the relevant images as the background for each card …
 * also uniform the card sizes for both the pages … only the heading and
 * nothing else", holding up an Aēsop poster as the reference.
 *
 * Three things can go wrong with that and none of them is loud. A card can name
 * a picture that was never added, and draw a grey rectangle where a photograph
 * was promised. The two floors can drift a few pixels apart the first time one
 * of them is edited, because they were two copies of the same markup. And the
 * heading-only rule can be quietly walked back one line at a time — an eyebrow
 * here, a "learn more" there — until the tile is the old card with a picture
 * behind it. This file is the guard against all three.
 */
describe('The card is the picture', () => {
  it('gives every shelf on both floors a photograph that is actually on disk', () => {
    const cards = [...FITTED, ...OPEN];
    // Twelve since 23 Aug: the two jewellery shelves. A coming-soon shelf has
    // no hub and no room, but it is still a photograph on a grid — the picture
    // is the ONE thing it is not allowed to be missing, or the card is a grey
    // rectangle promising a shop.
    expect(cards.length).toBe(12);
    const missing = cards
      .filter((s) => !s.art || !existsSync(img(s.art)))
      .map((s) => `${s.path} → ${s.art ?? '(none)'}`);
    expect(missing).toEqual([]);
  });

  /**
   * A CARD, NOT A PLATE. The landing heroes are 200–350 KB and right to be:
   * they are one picture filling a screen. Ten of these are on one grid, above
   * the fold, and the failure this prevents is not a missing file — that one is
   * loud — but a 400 KB one added later by somebody dropping in the original.
   */
  it('keeps the artwork the size of a card', () => {
    const heavy = [...new Set([...FITTED, ...OPEN].map((s) => s.art))]
      .map((f) => ({ f, kb: Math.round(statSync(img(f)).size / 1024) }))
      .filter(({ kb }) => kb > 80);
    expect(heavy).toEqual([]);
  });

  /**
   * ONE SHAPE, CUT INTO THE FILES RATHER THAN CROPPED BY THE BROWSER. The tile
   * is `aspect-ratio: 3 / 4` and `object-fit: cover`, so a differently-shaped
   * file would not stretch — it would silently lose its edges, which for a
   * wordmark means losing the word. Cut them to the tile and nothing is
   * cropped by accident.
   */
  it('cuts every picture to the shape of the tile', () => {
    const wrong = [...new Set([...FITTED, ...OPEN].map((s) => s.art))]
      .map((f) => ({ f, ...size(img(f)) }))
      .filter(({ w, h }) => Math.abs(w / h - 0.75) > 0.01);
    expect(wrong).toEqual([]);
  });

  /**
   * THE SAME SHELF WEARS THE SAME FACE ON BOTH FLOORS. The Beauty Market is one
   * shop whether the city sent you to it or you walked in; two pictures for it
   * would be telling somebody they are two places.
   */
  it('gives one shelf one face, however you arrive at it', () => {
    const byHub = new Map<string, Set<string>>();
    for (const s of [...FITTED, ...OPEN]) {
      // A coming-soon shelf has no hub to be grouped under — which is the
      // whole of what "not built yet" means here. The two jewellery cards do
      // wear one face on both floors, and they do it by sharing a file rather
      // than by a rule this loop could check.
      if (!s.hub) continue;
      if (!byHub.has(s.hub)) byHub.set(s.hub, new Set());
      byHub.get(s.hub)!.add(s.art);
    }
    // Astrology is the exception that proves it: the gemstone bench stands on
    // both floors and wears one picture on both.
    expect([...byHub].filter(([, arts]) => arts.size > 1).map(([hub]) => hub)).toEqual([]);
  });

  /**
   * ── UNIFORM IS A COMPONENT, NOT A COINCIDENCE ─────────────────────────────
   *
   * "Uniform the card sizes for both the pages" cannot be kept by two files
   * agreeing today. Neither page is allowed to draw a card of its own.
   */
  it('draws both floors from one tile', () => {
    for (const page of ['features/ecommerce/pages/PersonalizedStore.tsx', 'features/ecommerce/pages/OpenMarket.tsx']) {
      const s = read(page);
      expect({ page, tile: s.includes('<ShelfTile') }).toEqual({ page, tile: true });
      expect({ page, ownCard: /className="ec-card/.test(s) }).toEqual({ page, ownCard: false });
    }
  });

  /**
   * AND THE HEIGHT IS NOT MEASURED FROM THE TEXT. That is the entire bug the
   * owner was looking at: the old tile was a column of spans, so the shelf with
   * the longest sentence stood taller than the four beside it — differently on
   * each floor, because each floor printed a different sentence.
   */
  it('sizes the tile from its shape rather than its heading', () => {
    const css = readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
    const card = css.slice(css.indexOf('.ec-card {'), css.indexOf('.ec-go {'));
    expect(card).toMatch(/aspect-ratio:\s*3\s*\/\s*4/);
    expect(card).toMatch(/overflow:\s*hidden/);
    const art = css.slice(css.indexOf('.ec-art {'), css.indexOf('.ec-face {'));
    expect(art).toMatch(/object-fit:\s*cover/);
    /* NOT DARKENED, at the owner's word, and asserted because "put a scrim back
       on it" is the first thing anybody would reach for the next time a heading
       is hard to read on a photograph. That is a real problem on three of these
       six pictures and the answer to it is a darker picture, not a wash. */
    const block = css.slice(css.indexOf('.ec-card {'), css.indexOf('.ec-note {'));
    expect(block).not.toMatch(/\.ec-veil/);
    expect(block).not.toMatch(/background:\s*(linear|radial)-gradient/);
    /* THE SHADOW IS NOT A SCRIM COMING BACK. It is on the letterform rather
       than over the picture, it is what the owner asked for in place of the
       wash, and it is written from --scrim-top / --scrim-deep because
       colour-literal-ceiling.mjs is at its ceiling and an rgba() typed here
       would fail the build. */
    const name = css.slice(css.indexOf('.ec-name {'), css.indexOf('.ec-state {'));
    expect(name).toMatch(/text-shadow:.*var\(--scrim-/);
    expect(name).not.toMatch(/rgba\(|#[0-9a-f]{3}/i);
  });

  /**
   * ── THE HEADING, AND NOTHING ELSE ─────────────────────────────────────────
   *
   * The eyebrow, the shelf's own sentence and the "Reads your … Profile" foot
   * came off the tile at the owner's word. All three are printed at the top of
   * the shop the card opens, so nothing was lost — but a rule like this is
   * walked back one span at a time, and the three class names are the thing to
   * watch for.
   */
  it('carries the heading and nothing else', () => {
    /* Comments stripped first, and this guard earned that line the same way
       its neighbour did: the note in ShelfTile explaining why the art is an
       `<img>` rather than a `style={{ backgroundImage }}` contains the very
       string the last assertion looks for. A rule that cannot be explained in
       place is a rule people route around. */
    const tile = read('features/ecommerce/ShelfTile.tsx')
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    for (const gone of ['ec-cat', 'ec-line', 'ec-from']) {
      expect({ gone, present: tile.includes(gone) }).toEqual({ gone, present: false });
    }
    // The picture is decorative: the heading is the link's accessible name, and
    // an alt repeating it would have a screen reader read the card twice.
    expect(tile).toMatch(/className="ec-art"[^>]*alt=""/);
    // The ceiling is at its ceiling on inline style objects, and a background
    // image set in a style prop is exactly how a card grows one.
    expect(tile).not.toMatch(/style=\{\{/);
  });

  /**
   * ONE CARD IS ALLOWED A SECOND LINE and it is the one that is not a door. The
   * grocery list downloads a file when it is pressed; a tile that does that
   * without saying so is a surprise. Everything else passes no note at all.
   */
  it('lets only the card that is not a door say anything more', () => {
    const notes = [
      ['features/ecommerce/pages/PersonalizedStore.tsx', false],
      ['features/ecommerce/pages/OpenMarket.tsx', false],
      ['features/ecommerce/store/GroceryDownloadCard.tsx', true],
    ] as const;
    for (const [file, allowed] of notes) {
      expect({ file, note: /\bnote=\{/.test(read(file)) }).toEqual({ file, note: allowed });
    }
  });

  /**
   * ── BOTH FLOORS NAME THE SHELF ────────────────────────────────────────────
   *
   * Owner, 22 Aug: the market's fitness card should read "Supplements", not
   * "The Store". Renaming the room was not available — the Fitness rail already
   * carries a Supplements row (05, the goal-matched kit) beside The Store (07,
   * the whole shelf), and two identical rows in one sidebar is worse than the
   * problem. So a shelf may carry a name of its own, and the market's cards do.
   *
   * THIS TEST SAID "AND THE STORE NAMES THE ROOM" FOR A DAY, and that half was
   * a coincidence written up as a principle. Four of the five store cards —
   * Your Beauty Routine, Supplements, Grocery Lists, Gemstones — are rooms
   * whose names happen to be what is on the shelf. Diet plan is the fifth, and
   * it is the one room in the set named after what it DOES; on a run of five
   * cards it read as the odd card rather than as the pet shelf. Owner, 23 Aug:
   * make it say Pets. The room keeps its name, because inside the Pets rail
   * "Diet plan" is one of six rooms and the name is what says which.
   *
   * WHAT IS STILL A RULE, and it is the half that was doing the work: the room
   * is the DEFAULT and an override is opt-in, so no card can end up nameless;
   * every OPEN shelf must declare one, because an aisle board organised by
   * anything other than aisles is not an aisle board; and the two pages read
   * the same expression, so the floors cannot drift.
   */
  it('names every card from its shelf, falling back to the room', () => {
    const noAisle = OPEN.filter((s) => !s.category).map((s) => s.path);
    expect(noAisle).toEqual([]);
    expect(openShelves().map((s) => s.category))
      .toEqual(['Skin & hair', 'Supplements', 'Pets', 'Gemstones', 'Deals & offers', 'Jewellery']);
    // One expression, both floors — and the room is the fallback rather than
    // the other way round, so a shelf that says nothing still has a name.
    for (const page of ['features/ecommerce/pages/OpenMarket.tsx', 'features/ecommerce/pages/PersonalizedStore.tsx']) {
      expect({ page, named: /name=\{s\.category \?\? s\.name\}/.test(read(page)) }).toEqual({ page, named: true });
    }
    // The store overrides exactly once, and the room it overrides keeps its own
    // label — a rename in hubs.ts would have hit the Pets rail as well.
    expect(FITTED.filter((s) => s.category).map((s) => [s.path, s.category]))
      .toEqual([['/pets/plan', 'Pets']]);
    expect(HUBS.pets.items.find((i) => i.path === '/pets/plan')?.label).toBe('Diet plan');
  });

  /** And the resolved cards still carry the art through to the page. */
  it('hands the picture to the tile with the name', () => {
    for (const card of [...fittedShelves(), ...openShelves()]) {
      expect({ path: card.path, art: Boolean(card.art) }).toEqual({ path: card.path, art: true });
    }
  });
});
