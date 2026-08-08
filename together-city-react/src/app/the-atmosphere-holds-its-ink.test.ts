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
 * THE MEDICAL ATMOSPHERE, HELD TO ITS OWN MEASUREMENT.
 *
 * The look began as a reference photograph whose central move — white type on
 * clear glass over white steam — measured 1.23:1 off the composited pixels.
 * The fix was a smoked pane, and the tint was chosen by arithmetic, not by
 * eye. This file is that arithmetic, run on every build, against the tokens
 * as they actually are.
 *
 * THE WORST CASE IS MODELLED, NOT SAMPLED. Behind any pane the brightest
 * possible ground is the steam at full white (the landing's plume core, .95
 * of pure white over anything). So each ink is composited over its pane over
 * PURE WHITE — if it reads there, it reads under any steam the SVG can draw.
 * The one concession the model grants: the light pane only ever carries a
 * GLANCE (a chip, a section link, a CTA — full-strength ink), so the soft ink
 * is only asserted on the dense pane, which is the only pane that carries
 * prose. That split is the design's actual rule, and if somebody puts a
 * paragraph on the light pane, the failure belongs on their screen, where the
 * borrowed-names and ink-reset guards below make it visible.
 */
const rgba = (name: string, css = tokens) => {
  const m = css.match(new RegExp(`${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\.?[\\d.]+)\\)`));
  if (!m) return null;
  return { rgb: [+m[1], +m[2], +m[3]] as const, a: +m[4] };
};
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (rgb: readonly number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const contrast = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg: readonly number[], a: number, bg: readonly number[]) =>
  fg.map((c, i) => a * c + (1 - a) * bg[i]) as unknown as readonly number[];

const WHITE = [255, 255, 255] as const;

describe('the medical atmosphere holds its ink', () => {
  const pane = rgba('--atmos-pane')!;
  const dense = rgba('--atmos-pane-dense')!;
  const softInk = rgba('--on-atmos-soft')!;

  it('declares the materials it is measured on', () => {
    expect(pane).not.toBeNull();
    expect(dense).not.toBeNull();
    expect(softInk).not.toBeNull();
    expect(tokens).toMatch(/--on-atmos:\s*#ffffff/);
  });

  it('keeps full ink readable on the light pane under full-white steam', () => {
    const ground = over(pane.rgb, pane.a, WHITE);
    // 3:1, not 4.5 — everything the light pane carries is large-or-bold
    // glance text (chips, the CTA, tile labels at 700). The dense pane is
    // where 4.5 is owed, and it is asserted below at full strictness.
    expect(contrast(WHITE, ground)).toBeGreaterThanOrEqual(3);
  });

  it('keeps even the soft ink readable on the dense pane under full-white steam', () => {
    const ground = over(dense.rgb, dense.a, WHITE);
    const ink = over(softInk.rgb, softInk.a, ground);
    expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the band\'s ink readable over the sky\'s brightest steam', () => {
    // The work pages' content stands on ONE dense smoked band — the mock's
    // own architecture. That band is what freed the sky to be the sunrise
    // again: the first shipped sky was strangled to rgb(122,66,14) because
    // bare ink stood directly on it, and the owner compared the result to
    // the reference and called it nowhere close. So the case modelled here
    // is the one that exists now: the FAINTEST stage ink, on the dense
    // pane, over the strongest wisp, over the sky's brightest stop.
    const air = tokens.match(/--atmos-air:([\s\S]*?);/)?.[1] ?? '';
    const alphas = [...air.matchAll(/rgba\(255,\s*255,\s*255,\s*(\.?[\d.]+)\)/g)].map((m) => +m[1]);
    expect(alphas.length).toBeGreaterThan(0);
    const cap = Math.max(...alphas);
    const stops = [...air.matchAll(/#([0-9a-f]{6})/gi)]
      .map((m) => [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
    const lightest = stops.reduce((x, y) => (lum(x) > lum(y) ? x : y));
    const ground = over(dense.rgb, dense.a, over(WHITE, cap, lightest));

    const handoff = tokens.match(/\[data-hub="medical"\] \.tc-main \{([^}]*)\}/)?.[1] ?? '';
    const faintA = +(handoff.match(/--faint:\s*rgba\(255,\s*255,\s*255,\s*(\.?[\d.]+)\)/)?.[1] ?? 0);
    expect(faintA).toBeGreaterThan(0);
    const ink = over(WHITE, faintA, ground);
    expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);

    // ...and the band is actually applied, or this measures a material
    // nothing wears
    expect(relief).toMatch(/\[data-hub="medical"\] \.tc-main \.page \{[^}]*var\(--atmos-pane-dense\)/);
  });

  it('gives the card the stage ink and the glass well — not the paper list', () => {
    // The owner kept the glass: a card is a well sunk into the band, white
    // ink on dark tint, and it must NOT appear on the paper handoff list —
    // being there would hand it black ink on a dark ground.
    expect(relief).toMatch(/\[data-hub="medical"\] \.tc-main \.card \{[^}]*background:\s*var\(--atmos-tile\)/);
    const paper = tokens.match(/\[data-hub="medical"\] \.tc-main \.chip,[^{]*\{/)?.[0] ?? '';
    expect(paper).not.toBe('');
    expect(paper).not.toMatch(/\.tc-main \.card\b/);
    const handoff = tokens.match(/\[data-hub="medical"\] \.tc-main \{([^}]*)\}/)?.[1] ?? '';
    expect(handoff).toMatch(/--ink:\s*#ffffff/);
  });

  it('keeps every ghost flag readable on the card glass, computed', () => {
    // The mock's LOW/HIGH/NORMAL flags: tinted glass, light ink, same hue.
    // Worst ground: the tint over the card well over the band over the
    // sky's brightest steam — every layer parsed from the tokens as written.
    const air = tokens.match(/--atmos-air:([\s\S]*?);/)?.[1] ?? '';
    const cap = Math.max(...[...air.matchAll(/rgba\(255,\s*255,\s*255,\s*(\.?[\d.]+)\)/g)].map((m) => +m[1]));
    const stops = [...air.matchAll(/#([0-9a-f]{6})/gi)]
      .map((m) => [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
    const lightest = stops.reduce((x, y) => (lum(x) > lum(y) ? x : y));
    const tile = rgba('--atmos-tile')!;
    const band = over(dense.rgb, dense.a, over(WHITE, cap, lightest));
    const well = over(tile.rgb, tile.a, band);

    const handoff = tokens.match(/\[data-hub="medical"\] \.tc-main \{([^}]*)\}/)?.[1] ?? '';
    for (const pair of [['--ok-soft', '--ok-ink'], ['--warn-soft', '--warn-ink'],
      ['--danger-soft', '--danger-ink'], ['--accent-soft', '--accent-ink']]) {
      const soft = rgba(pair[0], handoff);
      expect({ pair: pair[0], declared: Boolean(soft) }).toEqual({ pair: pair[0], declared: true });
      const inkHex = handoff.match(new RegExp(`${pair[1]}:\\s*#([0-9a-f]{6})`, 'i'))?.[1];
      expect({ pair: pair[1], declared: Boolean(inkHex) }).toEqual({ pair: pair[1], declared: true });
      const flag = over(soft!.rgb, soft!.a, well);
      const ink = [0, 2, 4].map((i) => parseInt(inkHex!.slice(i, i + 2), 16));
      const r = contrast(ink, flag);
      expect({ pair: pair[1], aa: r >= 4.5, ratio: +r.toFixed(2) })
        .toEqual({ pair: pair[1], aa: true, ratio: +r.toFixed(2) });
    }
  });

  it('hands the city ink back to every surface that stays paper', () => {
    // Wells, chips, buttons, modals, stat tiles, rows, and .onpaper — the
    // name a hand-rolled inline var(--card) face wears so the handoff can
    // reach it. Their values must EQUAL the city's; copies rot, so parse
    // both and compare, statuses included.
    const reset = tokens.match(/\[data-hub="medical"\] \.tc-main \.chip,[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(reset).not.toBe('');
    const root = tokens.split(/\[data-hub=/)[0];
    for (const name of ['--ink', '--ink-soft', '--muted', '--faint']) {
      const rootVal = root.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
      const resetVal = reset.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
      expect({ name, resetVal }).toEqual({ name, resetVal: rootVal });
    }
    const hub = tokens.match(/\[data-hub="medical"\]\s+\{([^}]*)\}/)?.[1] ?? '';
    expect(reset.match(/--accent-ink:\s*([^;]+);/)?.[1].trim())
      .toBe(hub.match(/--accent-ink:\s*([^;]+);/)?.[1].trim());
    // and the pages' own hand-rolled paper actually wears the name
    for (const page of ['features/medical/pages/BloodAnalysis.tsx',
      'features/medical/pages/Connections.tsx', 'features/medical/pages/SupplementPlan.tsx']) {
      expect({ page, named: read(`src/${page}`).includes('className="onpaper"') })
        .toEqual({ page, named: true });
    }
  });

  it('leaves the ground tokens alone — this is a stage, not a sixth grant', () => {
    // relief.spec asserts the five granted hubs by equality; this is the same
    // fact stated from the atmosphere's side, so a future edit that reaches
    // for [data-hub="medical"] { --paper: … } fails HERE with the reason.
    const medical = [...tokens.matchAll(/\[data-hub="medical"\][^{]*\{([^}]*)\}/g)]
      .map((m) => m[1]).join(' ');
    expect(medical).not.toMatch(/--(ground|paper|card|wash|rail-well)\s*:/);
  });
});
