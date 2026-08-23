import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');

/** The dating block: the one that owns a --paper, found the way relief.spec finds it. */
const block = [...tokens.matchAll(/\[data-hub="dating"\]\s*\{([\s\S]*?)\n\}/g)]
  .map((m) => m[1]).find((b) => /--paper:/.test(b)) ?? '';
/* Comments stripped first: this block argues its own reversal at length and
   quotes the token names it is arguing about, so a naive match reads a
   sentence out of a paragraph rather than a value off a declaration. */
const decls = block.replace(/\/\*[\s\S]*?\*\//g, ' ');
const val = (n: string) => decls.match(new RegExp(`${n}:\\s*([^;]+);`, 'i'))?.[1]?.trim();

const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/**
 * ── TWO COLOURS, AND NO THIRD ───────────────────────────────────────────────
 *
 * Owner, 23 Aug, with a reference: warm greige paper, one deep aubergine, and
 * nothing else. #E7E2DB and #3A2027.
 *
 * relief.spec already measures every ink in this hub against the surface it is
 * read on, and it does that generically for all five grounded hubs. What it
 * cannot know is which two colours this room was supposed to be made OF — so
 * a palette could drift a long way from the reference while every ratio still
 * cleared. That is what this file holds.
 */
describe('the dating hub is the reference’s two colours', () => {
  it('takes the reference’s greige for its wall, unadjusted', () => {
    expect(val('--ground')).toBe('#e7e2db');
  });

  it('takes the reference’s aubergine for its ink, unadjusted', () => {
    expect(val('--ink')).toBe('#3a2027');
  });

  /**
   * THE ROOM IS LIT NOW, which is the reversal. Every ground must be lighter
   * than every ink — the one-line statement of "this is a light room" that
   * survives somebody re-tuning individual values.
   */
  it('is a light room: every ground is lighter than every ink', () => {
    const grounds = ['--ground', '--paper', '--card', '--wash', '--rail-well'];
    const inks = ['--ink', '--ink-soft', '--muted', '--faint', '--accent-ink', '--on-ground'];
    const darkestGround = Math.min(...grounds.map((g) => lum(val(g)!)));
    const lightestInk = Math.max(...inks.map((i) => lum(val(i)!)));
    expect({ lit: darkestGround > lightestInk }).toEqual({ lit: true });
  });

  it('puts the signature back in ink — the wall is paper, so nothing inverts', () => {
    expect(val('--word-filter')).toBe('none');
  });

  /**
   * AND NO BLACK. `--loud-face` is a black gradient at :root, and on the
   * city's white that is right — black is simply the farthest thing from the
   * ground. Here it would be a third colour in a two-colour room, and it is
   * the largest, loudest object on the page.
   */
  it('has no black in it — the loud button is the room’s own dark', () => {
    const loud = val('--loud-face')!;
    expect(loud).not.toMatch(/#000\b|#000000|\b#0[0-9a-f]{5}\b/i);
    expect(loud).toMatch(/#3a2027/);
    expect(val('--accent')).toBe('#3a2027');
  });

  /**
   * THE STATUS PANELS ARE THE ROOM'S. The root's four are near-white greens,
   * creams and blues. A green-white card on greige is the same wrong thing a
   * green-white card on crimson was — the instruction that produced this in
   * the crimson pass, kept.
   */
  it('paints no status panel another colour', () => {
    for (const n of ['--ok-soft', '--warn-soft', '--danger-soft', '--info-soft']) {
      const v = val(n)!;
      expect({ token: n, near: Math.abs(lum(v) - lum(val('--wash')!)) < 0.02 })
        .toEqual({ token: n, near: true });
    }
  });

  /**
   * The sky is a token relief.css reads into `background-image`, and it is the
   * one surface the AA machinery historically could not see. It is almost flat
   * here because the reference is a sheet of paper — but "almost flat" is a
   * claim, so it is measured: no stop may differ from the wall by much.
   */
  it('hangs paper rather than a picture', () => {
    const stops = [...val('--sky-image')!.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    const wall = val('--ground')!;
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // Under 1.2:1 against the wall at every stop. A real sky — the crimson one
    // this replaced, or entertainment's — runs several times that.
    for (const s of stops) {
      const r = ratio(s, wall);
      expect({ stop: s, flat: r < 1.2 }).toEqual({ stop: s, flat: true });
    }
  });
});
