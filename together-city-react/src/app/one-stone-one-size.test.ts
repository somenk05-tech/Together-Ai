import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(APP, 'public/assets/gems');
const API = join(APP, '..', 'together-city-chat', 'src');

/** The three-branch WebP header read `relief.spec` uses for the tarot deck. */
function size(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  const tag = b.subarray(12, 16).toString('latin1');
  if (tag === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (tag === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  const n = b.readUInt32LE(21);
  return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
}

/**
 * ── ONE STONE, ONE SIZE ─────────────────────────────────────────────────────
 *
 * Owner, 23 Aug, looking at the gem counter: "fix the sizes of the stones, to
 * match the same size visually … the correct size look is yellow sapphire and
 * ruby, match all stones to be visible in that size."
 *
 * THE THIRTY PHOTOGRAPHS WERE SHOT AT THIRTY SCALES. Measured against their own
 * frames, the stone filled anywhere from 34% (red coral) to 92% (moonstone) —
 * so on a shelf where every tile is the same square, a pearl arrived looking
 * like a fist and a coral like a bead. Nothing about the stones is that
 * different; it was the framing.
 *
 * Each file was re-cut: subject bounding box measured against the image's OWN
 * paper colour, rescaled so its longer side is 62% of the frame — ruby's
 * original framing, which is the one the owner named — and centred on an
 * 800×800 square.
 *
 * ── WHAT THIS FILE CAN AND CANNOT CHECK ─────────────────────────────────────
 *
 * The canvas, yes: one shape, one size, read straight out of the WebP header.
 * That is the half that breaks silently, because `.st-shot` is a square box
 * with `object-fit: contain` — drop in a 600×900 photograph and the stone is
 * letterboxed smaller than its neighbours with nothing on screen to say why.
 *
 * The subject's scale WITHIN the frame, no: that needs a decoded bitmap, and
 * decoding WebP in a unit test means a dependency this repo does not have and
 * should not grow for one assertion. Saying so here is better than a test that
 * implies it checked. If a stone ever looks wrong again, the measurement is a
 * bounding box against the corner colour — see the commit that landed this.
 */
describe('one stone, one size', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.webp'));

  it('has a photograph for every stone in the catalogue', () => {
    const catalogue = readFileSync(join(API, 'astrology/gems/gem-catalog.ts'), 'utf8');
    const ids = [...catalogue.matchAll(/^\s*number: \d+, id: '([^']+)'/gm)].map((m) => m[1]);
    expect(ids.length).toBe(30);
    const missing = ids.filter((id) => !files.includes(`${id}.webp`));
    expect(missing).toEqual([]);
  });

  /**
   * ONE SHAPE. A square canvas is what makes the tile's `object-fit: contain`
   * a no-op rather than a letterbox, so every stone is scaled by the same rule.
   */
  it('cuts every stone to the same square frame', () => {
    const odd = files
      .map((f) => ({ f, ...size(join(DIR, f)) }))
      .filter(({ w, h }) => w !== 800 || h !== 800);
    expect(odd).toEqual([]);
  });

  /**
   * AND STAYS THE SIZE OF A THUMBNAIL. Thirty of these load on one shelf, all
   * above the fold. The ceiling is roughly twice the largest today.
   */
  it('keeps each one the weight of a thumbnail', () => {
    const heavy = files
      .map((f) => ({ f, kb: Math.round(statSync(join(DIR, f)).size / 1024) }))
      .filter(({ kb }) => kb > 90);
    expect(heavy).toEqual([]);
  });
});
