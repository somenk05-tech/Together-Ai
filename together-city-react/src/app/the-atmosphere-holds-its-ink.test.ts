import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(HERE, '..', '..', p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const tokens = strip(read('src/styles/tokens.css'));
const relief = strip(read('src/styles/relief.css'));

/**
 * MEDICAL'S ENVIRONMENT, HELD TO ITS OWN MEASUREMENT — third edition.
 *
 * This file has now guarded three looks in a row, and each rewrite kept one
 * thing constant: the worst case is MODELLED FROM THE TOKENS AS WRITTEN, not
 * remembered from a screenshot. The amber era modelled white ink over smoked
 * panes over steam; the gradient era is simpler — a light sheet over a cool
 * field, carrying the city's dark ink — and the model is correspondingly
 * smaller: composite the sheet over EVERY stop of the field, and hold the
 * two darkened greys of the handoff (the only inks this look re-points) to
 * 4.5:1 on all of them. The darkest stop is the purple shoulder, not the
 * ember — a light pane over a warm bright patch reads fine; over a dark one
 * is where soft grey goes to die. The lesson that a dark ink's worst ground
 * is the DARK end (learned at 4.15:1 on the frosted cards) is baked in by
 * construction this time: every stop is checked, both ends included.
 */
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (rgb: readonly number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const contrast = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg: readonly number[], a: number, bg: readonly number[]) =>
  fg.map((c, i) => a * c + (1 - a) * bg[i]) as unknown as readonly number[];
const hexRgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const WHITE = [255, 255, 255] as const;

const sheet = (() => {
  const m = tokens.match(/--sheet:\s*rgba\(255,\s*255,\s*255,\s*(\.?[\d.]+)\)/);
  return m ? +m[1] : NaN;
})();
const fieldStops = [...(tokens.match(/--atmos-air:([\s\S]*?);\n/)?.[1] ?? '').matchAll(/#([0-9a-f]{6})/gi)]
  .map((m) => hexRgb(m[1]));

describe('the medical sheet holds its ink', () => {
  it('declares the materials it is measured on', () => {
    expect(Number.isNaN(sheet)).toBe(false);
    expect(fieldStops.length).toBeGreaterThanOrEqual(4);
    expect(relief).toMatch(/\[data-hub="medical"\] \.tc-main \.page \{[^}]*background:\s*var\(--sheet\)/);
  });

  it('keeps the handoff greys readable on the sheet over EVERY stop of the field', () => {
    const handoff = tokens.match(/\[data-hub="medical"\] \.tc-main,[\s\S]*?\{([^}]*)\}/)?.[1] ?? '';
    for (const name of ['--muted', '--faint']) {
      const hex = handoff.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'))?.[1];
      expect({ name, declared: Boolean(hex) }).toEqual({ name, declared: true });
      const ink = hexRgb(hex!);
      for (const stop of fieldStops) {
        const ground = over(WHITE, sheet, stop);
        const r = contrast(ink, ground);
        const id = stop.join(',');
        expect({ name, stop: id, aa: r >= 4.5, ratio: +r.toFixed(2) })
          .toEqual({ name, stop: id, aa: true, ratio: +r.toFixed(2) });
      }
    }
  });

  it('re-points NOTHING else — the whole point of the light sheet', () => {
    // The amber era's machinery must stay deleted: no white ink family, no
    // ghost washes, no paper reset list. If somebody reaches for
    // --ink: #ffffff under this hub again, the failure should say why.
    const handoff = tokens.match(/\[data-hub="medical"\] \.tc-main,[\s\S]*?\{([^}]*)\}/)?.[1] ?? '';
    for (const name of ['--ink', '--ink-soft', '--accent-ink', '--ok-soft', '--warn-ink', '--danger-soft']) {
      expect({ name, rePointed: new RegExp(`${name}:`).test(handoff) })
        .toEqual({ name, rePointed: false });
    }
    for (const dead of ['--atmos-pane', '--atmos-tile', '--atmos-sheen', '--on-atmos']) {
      expect({ dead, inTokens: tokens.includes(dead), inRelief: relief.includes(dead) })
        .toEqual({ dead, inTokens: false, inRelief: false });
    }
  });

  it('leaves the ground tokens alone — a stage, never a sixth grant', () => {
    const medical = [...tokens.matchAll(/\[data-hub="medical"\][^{]*\{([^}]*)\}/g)]
      .map((m) => m[1]).join(' ');
    expect(medical).not.toMatch(/--(ground|paper|card|wash|rail-well)\s*:/);
  });

  it('keeps the header, rail and landing on the same sheet material', () => {
    for (const rule of [
      /\[data-hub="medical"\] \.tc-header \{[^}]*background:\s*var\(--sheet\)/,
      /\[data-hub="medical"\] \.tc-side \{[^}]*background:\s*var\(--sheet\)/,
      /\.mapane \{[^}]*background:\s*var\(--sheet\)/,
    ]) {
      expect(relief).toMatch(rule);
    }
    // and the rail carries NO ink overrides — the lamp lesson, learned once:
    // an attribute-scoped rule out-specifies `.side-menu a.active`, so the
    // only safe number of medical rail ink rules is zero.
    expect(relief).not.toMatch(/\[data-hub="medical"\] \.side-menu/);
  });
});
