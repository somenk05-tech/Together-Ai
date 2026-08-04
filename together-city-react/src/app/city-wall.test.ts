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
    const wall = css.slice(css.indexOf('.wall {'));
    expect(wall).not.toMatch(/background:\s*#/);
    for (const m of wall.matchAll(/box-shadow:\s*([^;]+);/g)) {
      expect(m[1]).toMatch(/var\(--(e1|e2|focus-ring)\)/);
    }
  });

  it('gives the load-more rail a real target, not a 10px word', () => {
    expect(css).toMatch(/\.wall-more \{[\s\S]*?min-height: 44px/);
  });
});
