import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
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
  it('is the reference’s two greys, and the ink is not black', () => {
    expect(val('--paper')).toBe('#fafafa');
    expect(val('--card')).toBe('#ffffff');
    expect(val('--ink')).toBe('#2a2a2a');
  });

  /**
   * NO PURE BLACK ANYWHERE IN THE ROOT SCALE. This is the assertion that would
   * catch the half-done version — an ink softened and an --accent, an
   * --ink-soft or a loud button left at #000, which on a page of small type is
   * the one object still lit by the old palette.
   */
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
  it('deleted those five sky tokens rather than blanking them', () => {
    expect(nc(tokens)).not.toMatch(/--sky-image:\s*none;[\s\S]{0,40}\[data-hub="(medical|fitness|realestate|financial|services)"\]/);
    // four hubs still hang one — the ones that also hold a ground.
    const remaining = [...nc(tokens).matchAll(/\[data-hub="([a-z]+)"\][^{]*\{([^}]*--sky-image[^}]*)\}/g)].map((m) => m[1]);
    expect([...new Set(remaining)].sort()).toEqual(['astrology', 'beauty', 'entertainment', 'nutrition']);
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

  it('resolves every depth to a hairline, and keeps all five names', () => {
    for (const d of ['--e1', '--e2', '--e3']) {
      expect({ depth: d, value: rootOf(d) }).toEqual({ depth: d, value: expect.stringMatching(/^var\(--rim(-strong)?\)$/) });
    }
    expect(rootOf('--rim')).toMatch(/^inset 0 0 0 1px var\(--line\)$/);
    // A depth that resolves to nothing is not flat, it is invisible: a white
    // card on #fafafa with no shadow and no border stops existing.
    for (const d of ['--e1', '--e2', '--e3', '--rim', '--rim-strong']) {
      expect({ depth: d, blank: rootOf(d) === 'none' || rootOf(d) === '' }).toEqual({ depth: d, blank: false });
    }
  });

  it('leaves no gradient in a face, a well or the loud button', () => {
    for (const t of ['--face', '--face-2', '--face-tall', '--face-key', '--well', '--loud-face']) {
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
    expect(r).toMatch(/\.btn-accent, \.btn-gold, \.btn-primary \{[^}]*box-shadow: none;/);
    expect(r).not.toMatch(/h1, \.hero-num, \.stat \.val, \.blk-head h2 \{\s*text-shadow/);
    // and the three primitives are set in the file that wins
    const btn = r.slice(r.indexOf('\n.btn {'), r.indexOf('\n.btn:not'));
    expect(btn).toMatch(/text-transform: uppercase/);
    expect(btn).toMatch(/border-radius: var\(--r-1\)/);
    expect(r).toMatch(/\.tag, \.pill, \.chip \{[\s\S]*?text-transform: uppercase/);
    expect(r).toMatch(/\.eyebrow \{[^}]*font-weight: 500/);
  });

  it('sets no heading bold, and none tight', () => {
    const h = nc(relief).match(/h1, h2, h3, h4 \{([^}]*)\}/)?.[1] ?? '';
    expect(h).toMatch(/font-weight: 400/);
    expect(h).not.toMatch(/letter-spacing: -/);
  });
});
