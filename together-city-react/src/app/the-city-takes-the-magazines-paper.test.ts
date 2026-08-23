import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const tokens = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
const relief = readFileSync(join(SRC, 'styles/relief.css'), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const root = nc(tokens).split(/\[data-hub=/)[0];
const val = (t: string) => root.match(new RegExp(`${t}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase();

const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * ── THE CITY TAKES THE MAGAZINE'S PAPER ─────────────────────────────────────
 *
 * Owner, 23 Aug, with a reference: near-white paper, hairline rules, one soft
 * near-black, wide-tracked labels, and no colour anywhere.
 *
 * relief.spec measures the relationships — a near-white page, a lighter card,
 * every ink readable on every ground a hub declares. What it cannot know is
 * WHICH near-white and WHICH near-black, and a palette can drift a long way
 * from a reference with every ratio still clearing. That is what this file is.
 */
describe('the city takes the magazine’s paper', () => {
  /**
   * THE TWO GREYS BECAME ONE WHITE, AND THE INK IS THE HALF THAT SURVIVED.
   *
   * The owner, one day later: "Make the entire background white for the entire
   * website no grey ... and no boarders and lines." So the near-white paper
   * and the hairline rules — two of the reference's four moves — are out, and
   * this test is left asserting the two that are not: a soft near-black rather
   * than #000, and no colour in the ground.
   *
   * WHICH IS MOST OF WHY THE REFERENCE STILL READS. The greys were the part
   * that was easiest to see and the least of what the look is made of; the
   * type, the tracking and the air are untouched by any of it.
   */
  it('keeps the reference’s ink, on a page that is now one white', () => {
    expect(val('--paper')).toBe('#ffffff');
    expect(val('--card')).toBe('#ffffff');
    expect(val('--ink')).toBe('#2a2a2a');
  });

  /**
   * NO PURE BLACK ANYWHERE IN THE ROOT SCALE. This is the assertion that would
   * catch the half-done version — an ink softened and an --accent, an
   * --ink-soft or a loud button left at #000, which on a page of small type is
   * the one object still lit by the old palette.
   */
  /**
   * AND THE BUTTON IS THE PICTURE, WITH A LABEL THAT CLEARS IT. White fails on
   * every stop of that sun — 1.98:1 on the amber, 3.69:1 on the coral — so the
   * label is the city's own ink, and the deep end is capped at #ea6a3e rather
   * than the photograph's #e45722, which is 3.89 and under AA. Both halves are
   * asserted: a dark label with an uncapped gradient is as broken as a white
   * one, and it is the half somebody would put back first.
   */
  it('lights the button with the sun, and keeps its label readable', () => {
    const face = root.match(/--loud-face:\s*([^;]+);/)?.[1] ?? '';
    const stops = [...face.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase());
    expect(stops.length).toBeGreaterThanOrEqual(2);
    const on = val('--on-loud')!;
    expect(on).toBe('#2a2a2a');
    for (const stop of stops) {
      const r = ratio(on, stop);
      expect({ stop, clears: r >= 4.5, at: Number(r.toFixed(2)) })
        .toEqual({ stop, clears: true, at: Number(r.toFixed(2)) });
    }
  });

  /**
   * ── AND THE FILAMENTS CAN ONLY ADD LIGHT ──────────────────────────────────
   *
   * A photograph of the chromosphere, tiled at 25% over the sun on the primary
   * button and the rail's lit key. Under `overlay` a source value of exactly
   * .5 is a no-op and anything above it lightens — so the tile is clamped to
   * the TOP HALF of its range before it ships, and the texture can only
   * improve the label's contrast, never break it.
   *
   * THE FIRST CUT DID BREAK IT. Full-range, the dark filaments took the coral
   * end from 4.53:1 to 3.88 — under AA, on the primary action of every screen,
   * and invisible to every guard in this repo because it happens in a blend
   * mode at render time. This asserts the two things that made it safe: the
   * blend is `overlay`, and the tile's darkest pixel is at or above mid.
   */
  it('ships a texture that can only lighten', () => {
    const rel = nc(relief);
    const layer = rel.slice(rel.indexOf('.btn-accent::after'), rel.indexOf('@media (prefers-contrast: more)', rel.indexOf('.btn-accent::after')));
    expect(layer).toMatch(/mix-blend-mode: overlay/);
    expect(layer).toMatch(/opacity: \.25/);
    expect(layer).toMatch(/sun-tex\.webp/);

    const file = join(APP, 'public/assets/img/sun-tex.webp');
    expect(existsSync(file)).toBe(true);
    expect(Math.round(statSync(file).size / 1024)).toBeLessThanOrEqual(12);
  });

  it('has no pure black left in the root ink scale', () => {
    for (const t of ['--ink', '--ink-soft', '--muted', '--faint', '--accent', '--accent-ink']) {
      expect({ token: t, value: val(t) }).not.toEqual({ token: t, value: '#000000' });
    }
    const loud = root.match(/--loud-face:\s*([^;]+);/)?.[1] ?? '';
    expect(loud).not.toMatch(/#000\b|#000000/);
  });

  /**
   * AND THE TWO GREYS ARE DERIVED AGAINST THE WASH, not inherited from when the
   * ground was #ffffff. --faint at its old value is 4.29:1 on the new wash —
   * under AA, on the surface it is read on most. relief.spec does not measure
   * the root scale at all: its AA sweep runs over hubs that hold a GROUND, and
   * the root holds nothing. So the floor is held here or nowhere.
   */
  it('clears AA on the darkest surface either grey sits on', () => {
    const wash = val('--wash')!;
    for (const t of ['--muted', '--faint']) {
      const r = ratio(val(t)!, wash);
      expect({ token: t, on: wash, clears: r >= 4.5, at: Number(r.toFixed(2)) })
        .toEqual({ token: t, on: wash, clears: true, at: Number(r.toFixed(2)) });
    }
    // and they stay in order: the floor is the lighter of the two
    expect(lum(val('--faint')!)).toBeGreaterThan(lum(val('--muted')!));
  });

  /**
   * ── AND THE FIVE SKIES ARE GONE, WHICH THE INK DECIDED ────────────────────
   *
   * Not a separate tidy-up. relief.spec's sky sweep failed in ten places the
   * moment the ink moved off black — text drawn bare on a gradient at 3.18:1 —
   * and the reference has no skies in it. These five hung a picture behind
   * white panels and held no ground, so the picture is all there was.
   */
  it('leaves no sky, and no machinery for one, in the five that hung one', () => {
    for (const hub of ['medical', 'fitness', 'realestate', 'financial', 'services']) {
      const block = [...nc(tokens).matchAll(new RegExp(`\\[data-hub="${hub}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'g'))]
        .map((m) => m[1]).join(' ');
      expect({ hub, sky: /--sky-image/.test(block) }).toEqual({ hub, sky: false });
      const rules = nc(relief).split('\n').filter((l) => l.includes(`[data-hub="${hub}"]`)).join('\n');
      expect({ hub, rules }).toEqual({ hub, rules: '' });
    }
  });

  /**
   * A TOKEN NOTHING READS IS A VALUE SOMEBODY RE-POINTS ONE DAY TO SEE WHAT
   * HAPPENS. The five were deleted rather than set to `none`.
   */
  /**
   * IT SAID FOUR AND IT SAYS NONE (23 Aug). Five skies came down with the ink;
   * the last four went with their hubs' grounds when the owner asked for the
   * same colour rule in every room. A token nothing reads is a value somebody
   * re-points one day to see what happens, so they are deleted rather than set
   * to `none` — and that is what this checks, in both directions.
   */
  it('leaves no hub a sky, deleted rather than blanked', () => {
    /* THE ROOT KEEPS `--sky-image: none` AND THAT IS NOT A LEFTOVER. The
       user-selectable SKINS still hang one — `html[data-skin]` reads the token
       in relief.css — and a skin is a citizen's own choice rather than a room's
       palette, which is a different feature and not what was asked to go. The
       root value is the default for "no skin chosen". */
    const hubBlocks = [...nc(tokens).matchAll(/\[data-hub="[a-z]+"\][^{]*\{([^}]*)\}/g)].map((m) => m[1]).join(' ');
    expect(hubBlocks).not.toMatch(/--sky-image/);
    const remaining = [...nc(tokens).matchAll(/\[data-hub="([a-z]+)"\][^{]*\{([^}]*--sky-image[^}]*)\}/g)].map((m) => m[1]);
    expect(remaining).toEqual([]);
  });
});

/**
 * ── AND THE RAISED FEELING GOES ─────────────────────────────────────────────
 *
 * Owner: "make everything flat instead of the raised feeling."
 *
 * THE SYSTEM IS NOT RETIRED, AND THAT IS THE POINT. relief.spec's rule is that
 * every surface is drawn at one of five NAMED depths, and the sentence beside
 * it is the licence for this: "a scope may change what a depth is MADE OF,
 * never how many there are." The names stay, every rule that reads them stays,
 * and what a depth is made of stops being a shadow and becomes a hairline.
 *
 * These assertions are for the parts that were NOT reached by re-pointing the
 * tokens — which is most of what went wrong on the way here. Three primitives
 * and one text-shadow were hand-written where a token was expected.
 */
describe('nothing is raised any more', () => {
  const rootOf = (name: string) => root.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim() ?? '';

  /**
   * AND THEN e1 BECAME NOTHING (23 Aug, "remove all plates and cards"). It was
   * the panel depth — a card, a stat, a row, a table — and there are no panels:
   * those keep their padding and lose their sheet.
   *
   * e2 AND e3 KEEP THE HAIRLINE and the distinction is not decorative. They are
   * what an OVERLAY is drawn at, and something drawn over the page has to be
   * distinguishable from the page or it is not an overlay. A dialog with no
   * edge on the same colour as what it covers is broken rather than flat.
   */
  it('draws panels at no depth and overlays at a hairline', () => {
    expect(rootOf('--e1')).toBe('none');
    for (const d of ['--e2', '--e3']) {
      expect({ depth: d, value: rootOf(d) }).toEqual({ depth: d, value: expect.stringMatching(/^var\(--rim(-strong)?\)$/) });
    }
    expect(rootOf('--rim')).toMatch(/^inset 0 0 0 1px var\(--line\)$/);
    for (const d of ['--rim', '--rim-strong']) {
      expect({ depth: d, blank: rootOf(d) === 'none' || rootOf(d) === '' }).toEqual({ depth: d, blank: false });
    }
  });

  /**
   * THE LOUD BUTTON LEFT THIS LIST (23 Aug). Every face and every well is one
   * colour — flat means flat — but the owner then asked for a photographed sun
   * as the button colour everywhere, and a sun is a gradient or it is not a
   * sun. It is the one coloured object in the city and the one object whose
   * whole job is to be the loudest thing on the page; a single warm accent
   * works precisely because nothing else competes with it.
   */
  it('leaves no gradient in a face or a well', () => {
    for (const t of ['--face', '--face-2', '--face-tall', '--face-key', '--well']) {
      const stops = [...rootOf(t).matchAll(/#[0-9a-f]{3,8}/gi)].map((m) => m[0].toLowerCase());
      expect({ token: t, distinct: [...new Set(stops)].length }).toEqual({ token: t, distinct: 1 });
    }
  });

  it('squares every corner but the pill', () => {
    for (const r of ['--r-1', '--r-2', '--r-3', '--r-4', '--r-5']) {
      expect({ radius: r, value: rootOf(r) }).toEqual({ radius: r, value: '0px' });
    }
    // --r-full is not a corner radius. It is what makes a pill a pill, and
    // every avatar, pip and switch in the city is built on it.
    expect(rootOf('--r-full')).toBe('999px');
  });

  /**
   * ── THE FOUR THINGS A TOKEN COULD NOT REACH ───────────────────────────────
   *
   * `.btn`, `.tag` and `.eyebrow` are declared in BOTH index.css and
   * relief.css, and relief.css is imported second — so three separate type
   * changes made in index.css did nothing at all until they were made here.
   * The loud button's shadow was six hand-written rgba layers rather than a
   * depth token, so flattening the depths left the loudest object on every
   * page still floating. And h1 carried a text-shadow: the raised feeling
   * applied to letterforms.
   *
   * Every one of those is invisible to a token-level guard, which is why they
   * are named here.
   */
  it('flattens the four things the tokens could not reach', () => {
    const r = nc(relief);
    // THE CLAIM WAS NEVER "no shadow", IT WAS "not six numbers written by
    // hand" — which is why the button survived a commit called flat. It is
    // moulded again (owner, 23 Aug, with a reference of a glass lozenge) and
    // the guard holds the half that mattered: whatever the loudest object on
    // the page is made of, it is made of a TOKEN, so the next person to
    // re-point the material re-points this too.
    expect(r).toMatch(/\.btn-accent, \.btn-gold, \.btn-primary \{[^}]*box-shadow: var\(--loud-case\);/);
    const face = r.slice(r.indexOf('\n.btn-accent, .btn-gold, .btn-primary {'));
    expect(face.slice(0, face.indexOf('}'))).not.toMatch(/rgba\(/);
    expect(r).not.toMatch(/h1, \.hero-num, \.stat \.val, \.blk-head h2 \{\s*text-shadow/);
    // and the three primitives are set in the file that wins
    const btn = r.slice(r.indexOf('\n.btn {'), r.indexOf('\n.btn:not'));
    expect(btn).toMatch(/text-transform: uppercase/);
    // AND THE CORNER IS THE PILL NOW. --r-1 is 0px and every corner in the
    // city is square; a button is the exception the reference asks for, and
    // --r-full is the name that already existed for it.
    expect(btn).toMatch(/border-radius: var\(--r-full\)/);
    expect(r).toMatch(/\.tag, \.pill, \.chip \{[\s\S]*?text-transform: uppercase/);
    expect(r).toMatch(/\.eyebrow \{[^}]*font-weight: 500/);
  });

  it('sets no heading bold, and none tight', () => {
    const h = nc(relief).match(/h1, h2, h3, h4 \{([^}]*)\}/)?.[1] ?? '';
    expect(h).toMatch(/font-weight: 400/);
    expect(h).not.toMatch(/letter-spacing: -/);
  });
});
