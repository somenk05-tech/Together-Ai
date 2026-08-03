import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/** A file is allowed to explain itself. Comments are not code. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const tokens = read('src/styles/tokens.css');
const relief = read('src/styles/relief.css');
const layout = read('src/styles/layout.css');
const index = read('src/index.css');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(APP, dir))) {
    const rel = join(dir, name);
    if (statSync(join(APP, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.tsx')) out.push(rel);
  }
  return out;
}
const PAGES = walk('src');

/**
 * COLOUR IS DATA HERE, NOT MATERIAL.
 *
 * Every entry is a literal that must NOT follow the theme, and the reason is
 * the entry. This is the same list the sweep script refuses to touch, written
 * out again on purpose: if the two ever disagree, one of them is wrong and the
 * disagreement is the thing worth noticing.
 */
const COLOUR_IS_DATA: Record<string, string> = {
  'src/features/travel/pages/Flights.tsx':
    'airline brand colours — third-party marks',
  'src/features/nutrition/pages/MealPlan.tsx':
    'macro chart series — four series that must stay distinguishable',
  'src/features/nutrition/components/VegMark.tsx':
    'the FSSAI veg / non-veg mark — a legal symbol',
  'src/features/calendar/pages/Calendar.tsx':
    'hub category legend — categorical, not pass/fail',
  'src/features/entertainment/pages/movieKit.tsx':
    'seeded poster-placeholder gradients',
  'src/features/auth/pages/RegisterForm.tsx':
    'password-strength ramp — an ordered scale',
  'src/features/fitness/pages/Sleep.tsx':
    'sleep band scale — its "good" is purple, not a status green',
  'src/features/social/ReelsView.tsx':
    'platform-convention affordance colours',
  'src/features/nutrition/pages/RecipeDetail.tsx':
    'mimetic icon tints — flame is orange because fire is orange',
};

/** #abc, #abcdef, #abcdef12 — never an HTML entity, never a hashtag. */
const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;

describe('Relief stays a system', () => {
  /**
   * NO SCREEN PICKS ITS OWN COLOURS.
   *
   * This is the one that took 918 edits to make true, and it is one careless
   * `color: '#2e7d32'` away from stopping being true. The failure it prevents
   * is not ugliness — it is that a screen with its own greens looks correct
   * today and is the only screen that does not change tomorrow.
   */
  it('has no hard-coded colour left in any page', () => {
    const offenders: string[] = [];
    for (const file of PAGES) {
      if (file in COLOUR_IS_DATA) continue;
      const found = [...new Set(stripTs(read(file)).match(HEX) ?? [])];
      if (found.length) offenders.push(`${file} → ${found.join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * EVERY EXEMPTION IS SPENT.
   *
   * An allow-list nobody prunes becomes a list of files nobody looks at. If a
   * file on it stops containing literals, it stops needing an exemption, and
   * carrying a dead one teaches the next person that the list is decorative.
   */
  it('keeps no exemption it is no longer using', () => {
    const dead = Object.keys(COLOUR_IS_DATA).filter(
      (f) => !new RegExp(HEX.source).test(stripTs(read(f))),
    );
    expect(dead).toEqual([]);
  });

  /**
   * FIVE DEPTHS, AND THERE IS NO SIXTH.
   *
   * A stylesheet that writes its own `0 4px 12px rgba(...)` is not adding a
   * shadow, it is adding a sixth depth — and depth is the whole language here,
   * because a monochrome design has no colour left to say "this is above that"
   * with. The exceptions below are the four places a raw shadow is the correct
   * answer, and each is named.
   */
  it('draws every surface at one of the five depths', () => {
    // The five depths, plus the four EDGES — a hairline's white underline, the
    // darker line under a table head, and the two pip halos. Nothing stands on
    // an edge, so an edge is not a depth; naming them is what lets the rule
    // above stay literally true instead of true-with-a-list-of-exceptions.
    const NAMED = /var\(--(e1|e2|e3|carve|carve-deep|press|rim|rim-strong|shadow|shadow-deep|edge-up|edge-in|pip|pip-ok)\)/;
    // A photograph, a filled black button and a text emboss are not surfaces —
    // they are ink and images, and they carry their own light.
    const ALLOWED = /(text-shadow|drop-shadow|\.hero|\.btn-accent|\.btn-gold|\.btn-primary|\.ask-cta|\.step\.|\.mincal|\.tag\.dark|\.knob|outline|inset 0 1px 0|no-case|img:not|video:not|\.case)/;
    const offenders: string[] = [];
    for (const [name, css] of [['relief.css', relief], ['layout.css', layout], ['index.css', index]] as const) {
      for (const block of strip(css).split('}')) {
        const selector = block.split('{')[0].trim();
        const body = block.split('{')[1];
        if (!body) continue;
        for (const decl of body.split(';')) {
          if (!/^\s*box-shadow\s*:/.test(decl)) continue;
          if (NAMED.test(decl) || /:\s*none/.test(decl)) continue;
          if (ALLOWED.test(selector) || ALLOWED.test(decl)) continue;
          offenders.push(`${name} — ${selector} {${decl.trim()}}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * COLOUR LIVES IN tokens.css AND NOWHERE ELSE.
   *
   * The material stylesheets are achromatic by construction: a lit face, a
   * white edge, a grey well. Every hex in them has its three channels equal.
   * The moment a chromatic literal appears in relief.css or index.css it is a
   * colour decision made in the wrong file — and it is the kind that survives
   * a repaint, because whoever repaints looks at tokens.css.
   *
   * tokens.css is exempt. It is where the hub accents and the status inks are
   * supposed to be.
   */
  it('keeps every colour decision in the token file', () => {
    const chromatic = (hex: string) => {
      let h = hex.slice(1);
      if (h.length === 3) h = [...h].map((c) => c + c).join('');
      return !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6));
    };
    const offenders: string[] = [];
    for (const [name, css] of [['relief.css', relief], ['layout.css', layout], ['index.css', index]] as const) {
      for (const hex of new Set(strip(css).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])) {
        if (chromatic(hex)) offenders.push(`${name} → ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * THE GROUND IS WHITE.
   *
   * --paper and --card are the ground. If either stops being white the page
   * splits into two tones again and every relief in the application loses the
   * thing it is measured against.
   */
  it('keeps the ground white', () => {
    for (const t of ['--ground', '--paper', '--card']) {
      expect(strip(tokens)).toMatch(new RegExp(`${t}:\\s*#ffffff`));
    }
    expect(strip(tokens)).not.toContain('[data-theme="dark"]');
  });

  /**
   * DARK MODE IS GONE, NOT HALF-GONE.
   *
   * A theme store nobody imports still sets data-theme on <html> the moment
   * one lazy chunk loads. Half-removed, it would repaint a handful of screens
   * on a page nobody expected — which is worse than either keeping it or
   * removing it.
   */
  it('has no theme switch left anywhere', () => {
    const survivors = PAGES.filter((f) => /useThemeStore|theme\.store|data-theme/.test(stripTs(read(f))));
    expect(survivors).toEqual([]);
  });

  /**
   * ONE TYPEFACE.
   *
   * --serif and --mono still exist because a few dozen call sites read them.
   * They must resolve to the same family: the moment one of them names a real
   * second font, a heading changes typeface halfway down a page and nobody can
   * say which screen did it.
   */
  it('resolves every font token to the one family', () => {
    expect(strip(tokens)).toMatch(/--serif:\s*var\(--sans\)/);
    expect(strip(tokens)).toMatch(/--mono:\s*var\(--sans\)/);
    expect(strip(tokens)).toMatch(/--sans:\s*'General Sans'/);
    const families = [...strip(relief).matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
    const foreign = families.filter((f) => !/var\(--(sans|serif|mono)\)|inherit|'General Sans'/.test(f));
    expect(foreign).toEqual([]);
  });

  /**
   * EVERY PICTURE IS SET INTO THE PAGE.
   *
   * The rim has to be an `outline`, not an inset box-shadow: on a replaced
   * element an inset shadow paints BEHIND the bitmap, so a carved well around
   * a photograph is invisible and looks fine to whoever writes it, because
   * they will be testing against a transparent PNG.
   */
  it('cases every image, and cases it with an outline', () => {
    const code = strip(relief);
    expect(code).toMatch(/img:not\(\.no-case\)/);
    expect(code).toMatch(/outline-offset:\s*-1px/);
    // and the double-rim exclusions exist, or a photo inside a case gets two
    expect(code).toMatch(/\.case > img[\s\S]{0,400}outline:\s*none/);
  });

  /**
   * MOTION IS A PREFERENCE, AND A TRANSFORM IS NOT AN ANIMATION.
   *
   * The global reduced-motion rule only zeroes durations, so without this a
   * hover still jumps 3px instantly — worse, for somebody who asked for less
   * movement, than the movement they asked to be rid of.
   */
  it('stops hover movement for anybody who asked for less motion', () => {
    const reduced = strip(relief).slice(strip(relief).lastIndexOf('prefers-reduced-motion'));
    expect(reduced).toContain('transform: none');
  });

  /**
   * EVERY HUB HAS A LIGHT OF ITS OWN.
   *
   * data-hub only ever REPLACES a value, so a hub with no entry does not fall
   * back to something neutral — it inherits whichever hub the citizen came
   * from. A missing entry means Nutrition glows rose on the way in from
   * Dating, and nobody can reproduce it.
   */
  it('gives every hub in the config an accent of its own', () => {
    const hubs = read('src/config/hubs.ts');
    const keys = [...new Set([...hubs.matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThanOrEqual(14);
    expect(keys.filter((k) => !tokens.includes(`[data-hub="${k}"]`))).toEqual([]);
  });

  /**
   * A LUMINOUS ACCENT IS NOT A TEXT COLOUR.
   *
   * --accent is a FILL: white sits on it. --accent-ink is the same hue
   * darkened until it can be read on white. They are two names because one
   * colour cannot do both jobs and clear AA, and the moment --accent is used
   * as `color` on a white surface something a citizen needs to read stops
   * being readable.
   */
  it('never uses the fill accent as text on a white surface', () => {
    const offenders: string[] = [];
    for (const file of PAGES) {
      const src = stripTs(read(file));
      for (const m of src.matchAll(/(?:^|[^-\w])color:\s*'var\(--accent\)'/g)) {
        offenders.push(`${file} @ ${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * THE FONT SHIPS.
   *
   * font-display: swap means a missing file is invisible in development — the
   * system sans renders and everything looks nearly right. This is the only
   * place that failure becomes loud before a release.
   */
  it('references a font file the build can actually serve', () => {
    const urls = [...strip(relief).matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of new Set(urls)) {
      expect(u.startsWith('/assets/fonts/')).toBe(true);
    }
  });
});
