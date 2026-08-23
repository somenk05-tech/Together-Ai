import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
const relief = readFileSync(join(SRC, 'styles/relief.css'), 'utf8');
const spec = readFileSync(join(SRC, 'app/relief.spec.ts'), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

const block = [...nc(tokens).matchAll(/\[data-hub="dating"\]\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);

/**
 * ── THE GROUND IS HANDED BACK ───────────────────────────────────────────────
 *
 * Owner, 23 Aug, with a photograph of white porcelain petals: this is the room
 * now.
 *
 * THAT BRIEF IS NOT A PALETTE. The rule this codebase states in three places is
 * that a hub holds a ground when words are read off something that is not the
 * city's white, and hands it back the moment that stops being true. A
 * porcelain-white dating hub IS the city's white — so the right change was a
 * deletion, and dating is the first hub ever to LEAVE relief.spec's granted
 * list rather than join it.
 *
 * relief.spec already checks that only granted hubs hold a ground. What it
 * cannot check is the thing this file is for: that the deletion was COMPLETE,
 * and that the one decision inside the old block that was never about the
 * ground survived it. A palette removed in eleven places and left in the
 * twelfth is a room that is white except for the part nobody screenshots.
 */
describe('the dating hub holds no ground', () => {
  it('re-points no ground token at all', () => {
    for (const b of block) {
      expect({ body: b.trim(), grounds: /--(ground|paper|card|wash|rail-well)\s*:/.test(b) })
        .toEqual({ body: b.trim(), grounds: false });
    }
  });

  /**
   * NOT ONE INK, EITHER, and this is the assertion that would catch the
   * half-done version. A hub with the city's white paper and its own --muted
   * is a hub whose body copy is a different grey from every other room's, for
   * no reason anybody could state.
   */
  /**
   * THE QUIET ACCENT IS NOT A GROUND COMING BACK (23 Aug, evening). Every
   * room, dating included, declares the four --accent* names again — small
   * chrome only, held by relief.spec's own assertion — so this list stops
   * naming them. What it still refuses is the half that made the old block a
   * ROOM: inks, faces, the lamp, the sky. A hub with the city's paper and
   * its own --muted is a hub whose body copy is a different grey from every
   * other room's, for no reason anybody could state; that claim is unchanged.
   */
  it('re-points no ink, no face, no sun and no sky', () => {
    /* --lamp-face LEFT THIS LIST ON 24 AUG with the owner's "match the side
       pill color to the color of the sector": every room re-points the rail
       key's face to its own accent now, dating included, and the rail
       assertion in relief.spec holds the lamp TO that accent. What this list
       still refuses is unchanged in kind — inks, faces, the sun, the sky:
       the things that would make the block a room again. */
    const body = block.join(' ');
    for (const t of ['--ink', '--ink-soft', '--muted', '--faint', '--on-accent',
                     '--loud-face', '--sky-image', '--frost',
                     '--line', '--face', '--well', '--word-filter']) {
      expect({ token: t, declared: new RegExp(`${t}\\s*:`).test(body) })
        .toEqual({ token: t, declared: false });
    }
  });

  /**
   * IT WAS "SHORTER THAN IT WAS" AND IT IS "EMPTY" (23 Aug). Dating was the
   * first hub ever to leave the granted list; the other four followed the same
   * afternoon on one instruction. The claim this file makes about dating is
   * unchanged and is now simply true of everybody.
   */
  it('is off the granted list, and so is every other hub', () => {
    const granted = /const GRANTED[^=]*=\s*\[([^\]]*)\]/.exec(spec)?.[1]?.trim() ?? 'MISSING';
    expect(granted).toBe('');
  });

  /**
   * AND THE SKY WENT WITH IT. Every rule that existed so a picture could be
   * seen through the room — the fixed background, the four transparents, the
   * ten frosted panels, the reduced-transparency query that undid all of it —
   * came out together. A hub that hands back its ground and keeps its
   * atmosphere has handed back nothing.
   */
  it('paints no sky and frosts no panel', () => {
    const rules = nc(relief).split('\n').filter((l) => l.includes('[data-hub="dating"]')).join('\n');
    expect(rules).not.toMatch(/--sky-image|background-attachment|backdrop-filter/);
    expect(rules).not.toMatch(/var\(--frost\)/);
    expect(rules).not.toMatch(/background:\s*transparent/);
    // and the shadow-and-restore pair, both halves
    expect(rules).not.toMatch(/--muted:\s*var\(|--faint:\s*var\(/);
  });

  /**
   * THE ONE THING THAT WAS NEVER ABOUT THE GROUND. The portraits have been
   * greyscale since the monochrome pass, through two grounds that came and
   * went, and the argument was always about photographs of PEOPLE rather than
   * what was behind them. Deleting the block wholesale would have taken it out
   * silently, which is the quiet way a decision dies.
   */
  it('keeps the greyscale portraits, which were never about the ground', () => {
    expect(block.join(' ')).toMatch(/--film:\s*url\(#tc-film-mono\)/);
    expect(nc(relief)).toMatch(/\[data-hub="dating"\] \.tc-main img[^\n]*\n[^\n]*filter: var\(--film\)/);
  });

  /**
   * AND THE SPACE STAYS, because it is geometry rather than colour: the
   * reference this hub was built from is two thirds empty and the emptiness is
   * the design. Handing back a ground is not a reason to re-crowd a page.
   */
  it('keeps the room it was given, which was never a colour', () => {
    expect(nc(relief)).toMatch(/\[data-hub="dating"\] \.tc-main \.page \{[\s\S]{0,200}padding-left: clamp/);
  });
});
