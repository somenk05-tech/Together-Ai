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

  it('shows every picture the post carries, not only the first', () => {
    // A post with four photographs was showing one of them. On a phone the
    // poster IS the post — the wall is a single column below 560px — so three
    // quarters of what somebody uploaded existed only for whoever opened it.
    //
    // SAME RULE AS THE COVER, APPLIED TO ALL OF THEM: an image is its own url,
    // a video is its cover frame, and a video without one contributes nothing.
    // If this ever becomes `.map((m) => m.url)` the strip starts rendering
    // blank frames for coverless videos, which looks like a broken image.
    expect(poster).toMatch(/post\.media\s*\n?\s*\.map\(\(m\) => \(m\.kind === 'image' \? m\.url : m\.thumbUrl\)\)/);
    expect(poster).toMatch(/\.filter\(\(u\): u is string => Boolean\(u\)\)/);
    expect(poster).toMatch(/covers\.length > 1/);
  });

  it('scrolls rather than carouselling, because a poster is one button', () => {
    // NO ARROWS, NO DOTS, NO AUTOPLAY — the arc in the Astrology zone made the
    // same call. Here it is not only taste: the poster is one button, and a
    // control inside it would be a tap target stacked inside a tap target,
    // which the test above counts. A swipe is not a click, so scrolling the
    // strip cannot open the post by accident.
    const strip = css.slice(css.indexOf('.poster-strip {'));
    expect(strip.slice(0, strip.indexOf('}'))).toMatch(/scroll-snap-type: x mandatory/);
    // A scroll container cannot honour `overflow-y: visible` — the browser
    // computes the other axis to auto — so leaving this out gives every poster
    // a vertical scroll it never asked for. The arc has the same note.
    expect(strip.slice(0, strip.indexOf('}'))).toMatch(/overflow-y: hidden/);
    // And the strip itself holds no controls.
    const markup = poster.slice(poster.indexOf('poster-strip'), poster.indexOf('poster-scrim'));
    expect(markup).not.toMatch(/<button|onClick/);
  });

  it('scrolls at every width, and does not hide the pictures above the phone', () => {
    // THIS ASSERTION USED TO REQUIRE THE OPPOSITE. It shipped phone-only on the
    // argument that a sideways scroll inside one of nine desktop tiles is a
    // gesture nobody is looking for — which was about the GESTURE and missed
    // what was under it: a post with four photographs still showed one, on the
    // screen where the tile is largest. Hiding the siblings hid the badge too,
    // so a desktop visitor had nothing telling them anything was missing.
    //
    // The trade is the fetch, and it is named in relief.css rather than left
    // for somebody to find with a network panel.
    // NOT `not.toMatch(/display: none/)`, WHICH IS THE OBVIOUS VERSION AND THE
    // WRONG ONE: the strip legitimately hides its own scrollbar with exactly
    // that declaration, so the broad form fails on a rule it should not care
    // about. What must not come back is a rule hiding the sibling PICTURES, or
    // a width query wrapping the strip at all.
    const strip = css.slice(css.indexOf('.poster-strip {'));
    const nextRule = strip.slice(0, strip.indexOf('.poster-count'));
    expect(nextRule).not.toMatch(/img:not\(:first-child\)/);
    expect(nextRule).not.toMatch(/@media[^{]*min-width/);
    // The scrollbar hiding is still there, so this test is reading the block it
    // thinks it is reading.
    expect(nextRule).toMatch(/::-webkit-scrollbar \{ display: none; \}/);
    // And the count is not hidden at any width either — it is the only thing on
    // a tile that says there is more than one picture.
    const count = css.slice(css.indexOf('.poster-count {'));
    expect(count.slice(0, count.indexOf('}'))).not.toMatch(/display: none/);
  });

  it('counts the pictures without claiming which one you are on', () => {
    // Nothing tracks the scroll position, so a badge reading "1/4" while you
    // look at the third is worse than no badge. It says how many there are.
    // The count is aria-hidden and repeated in the button's accessible name,
    // because somebody who cannot see the badge should still be told there are
    // four — and the name is the only thing this poster announces.
    expect(poster).toMatch(/className="poster-count" aria-hidden/);
    expect(poster).toMatch(/\$\{covers\.length\} photographs/);
    expect(poster).not.toMatch(/1\s*\/\s*\{covers\.length\}|currentIndex|activeSlide/);
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
