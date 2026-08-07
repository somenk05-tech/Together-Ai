import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const stripCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * THE CITY FEED IS A WALL, AND EVERY POSTER ON IT IS THE POST'S OWN.
 *
 * A feed of pictures is the one screen where invention is most tempting and
 * least forgivable: a placeholder image, a generated gradient standing in for a
 * photograph, a "trending" number nobody counted. The wall is allowed to be
 * beautiful only because every part of it came out of the post.
 */
describe('the city feed is a wall of the citizens\' own posters', () => {
  const poster = stripTs(read('src/features/social/Poster.tsx'));
  const feed = stripTs(read('src/features/social/pages/SocialFeed.tsx'));
  const css = stripCss(read('src/styles/relief.css'));

  it('draws the picture from the post, or draws no picture', () => {
    // The cover is the post's own first image, or a video's own cover frame.
    // There is no third branch — no placeholder, no seeded gradient, no stock.
    expect(poster).toMatch(/post\.media\.find\(\(m\) => m\.kind === 'image'\)/);
    expect(poster).toMatch(/image\?\.url \?\? video\?\.thumbUrl \?\? null/);
    expect(poster).not.toMatch(/placeholder|unsplash|picsum|https?:\/\//i);
  });

  it('sets a post with no picture as words, not as a fake photograph', () => {
    expect(poster).toMatch(/if \(!cover\)/);
    expect(poster).toMatch(/poster words/);
    expect(css).toMatch(/\.poster\.words \{[^}]*background: var\(--paper\)/);
  });

  it('shows only numbers the post carries', () => {
    expect(poster).toMatch(/\{post\.likes\}/);
    expect(poster).toMatch(/\{post\.comments\}/);
    // Nothing here counts views, reach or anything else the API does not send.
    expect(poster).not.toMatch(/views|reach|trending|score/i);
  });

  it('is one tap target, with one name that says whose moment it is', () => {
    // Buttons nested inside a button is the classic feed-tile bug: the tile
    // opens when you meant to like, and a screen reader reads four names for
    // one thing. There is exactly one <button> in a poster.
    expect((poster.match(/<button/g) ?? []).length).toBe(2); // the two branches, one each
    expect(poster).toMatch(/aria-label=\{name\}/);
    expect(poster).toMatch(/alt=""/); // the picture is named by the button
  });

  it('opens a poster in place, keeping the whole post', () => {
    // Expanding must not be a second rendering of a post — it is THE post
    // card, so likes, comments, share, save and repost keep working and cannot
    // drift from the ones on the profile.
    expect(feed).toMatch(/className="wall-open"/);
    expect(feed).toMatch(/<PostCard post=\{p\}/);
    expect(css).toMatch(/\.wall-open \{ grid-column: 1 \/ -1; \}/);
  });

  it('keys the open poster by feed key, not post id', () => {
    // A repost and its original are two entries carrying the same post. Keyed
    // on the id, opening one would open both.
    expect(feed).toMatch(/const key = p\.key \?\? p\.id/);
    expect(feed).toMatch(/key === openKey/);
  });

  it('closes what is open when the filter changes', () => {
    expect(feed).toMatch(/showFilter = \(key: string\) => \{ setOpenKey\(null\); setFilter\(key\); \}/);
  });

  it('stays on the city\'s white ground, at the named depths', () => {
    // The reference this came from is a gallery on black. The ground here is
    // white on every screen, and the wall did not get to be the exception.
    //
    // THE SLICE USED TO BE `css.slice(indexOf('.wall {'))` — everything from
    // the wall to the end of the file. That is not "the wall", it is "the wall
    // and whatever gets appended next", and the next thing appended was the
    // recipe card, whose photographs are deliberately flat on press paper. A
    // guard that fails on a rule three hundred lines below the feature it
    // names teaches people to widen it. So it reads the wall's own rules: every
    // block whose selector mentions .wall or .poster, wherever they sit.
    // THE PARSER USED TO READ EVERY OTHER RULE. `(?:^|\})` consumed the
    // PREVIOUS rule's closing brace, and `matchAll` resumes after the whole
    // match — which already included the current rule's `}` — so consecutive
    // rules could only match alternately. Which half of the file it checked
    // depended on brace parity, and adding an `@media` block anywhere above
    // silently swapped it. That is a guard whose coverage moves when you are
    // not looking. Anchoring on the selector instead walks every rule, nested
    // ones included, which is what this was always supposed to do.
    //
    // AND `.poster` NO LONGER CATCHES `.poster-hero`. They are different
    // components — the wall's tile and the entertainment hero — and the hero
    // legitimately wears --case-rim, which is a rim rather than one of the
    // five depths. A prefix match made the hero fail a rule written about the
    // wall, which is the same "guard names one feature and fails on another"
    // mistake the comment above records.
    const blocks = [...css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)]
      .filter((m) => /(^|[\s,>])\.(wall|poster)(?![\w-])/.test(m[1]));
    expect(blocks.length).toBeGreaterThan(10);
    for (const b of blocks) {
      expect(b[2]).not.toMatch(/background:\s*#/);
      for (const m of b[2].matchAll(/box-shadow:\s*([^;]+)/g)) {
        expect(m[1]).toMatch(/var\(--(e1|e2|focus-ring)\)/);
      }
    }
  });

  it('gives the load-more rail a real target, not a 10px word', () => {
    expect(css).toMatch(/\.wall-more \{[\s\S]*?min-height: 44px/);
  });
});
