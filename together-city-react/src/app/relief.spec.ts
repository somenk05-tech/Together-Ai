import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
    // A DEPTH TOKEN, NOT MERELY A RIM. --rim is the hairline that sits on top of
    // a depth, not a depth itself, and while it counted here any hand-written
    // shadow beginning `var(--rim), 0 2px 4px …` passed unread — which is
    // exactly how three bespoke header shadows got in. It is no longer enough
    // on its own.
    const NAMED = /var\(--(e1|e2|e3|e1-key|e2-key|carve|carve-deep|press|shadow|shadow-deep|edge-up|edge-in|pip|pip-ok|case-rim|case-rim-soft|lens|lens-key|lamp|lamp-badge|rail-well-shadow)\)/;
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
    // Matched on `img:not(.no-case)` once, which quietly encoded the bug: written
    // that way the rule outscores every exemption in its own list. It must be
    // :where(), which contributes no specificity.
    expect(code).toMatch(/img:not\(:where\([^)]*\.no-case/);
    expect(code).toMatch(/outline-offset:\s*-1px/);
    // and the double-rim exclusions exist, or a photo inside a case gets two
    expect(code).toMatch(/\.case > img[\s\S]{0,400}outline:\s*none/);
  });

  /**
   * THE STYLESHEET DOES NOT STYLE CLASSES THE MARKUP DOES NOT HAVE.
   *
   * `.n` is the sidebar's number badge and `.l` is its label. They were styled
   * as one rule once — because `.l` looked like it meant "the little icon" —
   * and the label inherited a 30x30 box, so every menu word wrapped inside a
   * square and printed on top of its own sub-line. Nothing failed: not the
   * typecheck, not the tests, not a single audit. A class name is a contract
   * between two files that never import each other, and this is the only thing
   * that can check it.
   */
  it('only styles shell classes the shell actually renders', () => {
    const SHELL = ['src/layouts/Sidebar.tsx', 'src/layouts/Header.tsx',
      'src/layouts/QuickActions.tsx', 'src/components/BottomNav.tsx'];
    const markup = SHELL.map(read).join('\n');
    // Class names arrive three ways in this shell: a literal className, a
    // ternary on isActive, and a template literal for the drawer's `open`. Any
    // quoted token in the file counts as rendered — loose on purpose, because
    // the defect worth catching is a class the component never mentions AT ALL.
    // TWO PASSES, because the drawer's open state is written
    // `className={`tc-side${open ? ' open' : ''}`}` — the class name lives in a
    // single-quoted string INSIDE a template expression. Strip the `${…}` and
    // it disappears; read the backticks naively and the whole expression parses
    // as one token. So: ordinary quotes first, backticks separately.
    const quoted = [...markup.matchAll(/['"]([^'"\n]{0,60})['"]/g)].map((m) => m[1]);
    const templated = [...markup.matchAll(/`([^`]{0,200})`/g)]
      .map((m) => m[1].replace(/\$\{[^}]*\}/g, ' '));
    const rendered = new Set([...quoted, ...templated]
      .flatMap((t) => t.split(/\s+/))
      .filter(Boolean));
    const offenders: string[] = [];
    for (const css of [relief, layout]) {
      // Only descendants of the shell containers — a global `.card` is not a
      // claim about what Sidebar.tsx renders.
      for (const m of strip(css).matchAll(/\.(side-menu|tc-nav|tc-actions|tc-actionbar|tc-side|tc-logo)\b[^{,]*?\.([a-z][a-z0-9-]*)/g)) {
        if (!rendered.has(m[2])) offenders.push(`.${m[1]} … .${m[2]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * THE SHELL DOES NOT SET ITS OWN MATERIAL FROM A STYLE PROP.
   *
   * `background: 'transparent'` in a style attribute beats every stylesheet in
   * the cascade, no matter how it is layered. The header's quick-action pills
   * carried exactly that, so they rendered with the RIM of --e1 and none of
   * its lit face — flat, on a page where everything else stood up, and
   * unfixable from CSS. Geometry may live in a style prop. Material may not.
   */
  it('leaves the shell material to the stylesheet', () => {
    const SHELL = ['src/layouts/Sidebar.tsx', 'src/layouts/Header.tsx',
      'src/layouts/QuickActions.tsx', 'src/components/BottomNav.tsx'];
    // NOT ALL INLINE STYLE IS THE PROBLEM. `boxShadow: 'var(--e3)'` in a style
    // prop cannot contradict the system — it IS the system, written somewhere
    // inconvenient. What breaks the material layer is a value the stylesheet
    // can never beat: `transparent`, a raw hex, or shouting. Those three, and
    // only those three, are what this refuses.
    const BAD = [
      [/\b(background|backgroundColor)\s*:\s*[^,}\n]*['"]transparent['"]/g, "background: 'transparent'"],
      [/\b(background|backgroundColor|boxShadow|color)\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/g, 'a raw colour'],
      [/\btextTransform\s*:\s*['"]uppercase['"]/g, "textTransform: 'uppercase'"],
      [/\bletterSpacing\s*:/g, 'letterSpacing'],
    ] as const;
    const offenders: string[] = [];
    for (const file of SHELL) {
      const src = stripTs(read(file));
      for (const [re, what] of BAD) {
        if (new RegExp(re.source).test(src)) offenders.push(`${file}: ${what}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * EVERY HUB LANDING HAS A PICTURE THAT EXISTS.
   *
   * HUB_HERO is a Partial map with a `${hub}.webp` fallback, so a hub missing
   * from it does not fail — it points at a filename nobody ever created and
   * renders an empty frame. /mail did exactly that, and nothing anywhere said
   * so: not the typecheck, not a test, not an audit. The picture IS the hub
   * landing; half of that page is the photograph.
   */
  it('gives every hub landing a hero file that is actually on disk', () => {
    const page = read('src/pages/HubLanding.tsx');
    const routed = [...new Set([...read('src/app/router.tsx')
      .matchAll(/HubLanding hub="([a-z]+)"/g)].map((m) => m[1]))];
    expect(routed.length).toBeGreaterThan(10);
    const map = Object.fromEntries(
      [...page.matchAll(/^\s*([a-z]+):\s*'([^']+\.webp)'/gm)].map((m) => [m[1], m[2]]),
    );
    const missing = routed
      .map((h) => [h, map[h] ?? `${h}.webp`] as const)
      .filter(([, file]) => !existsSync(join(APP, 'public/assets/img', file)))
      .map(([h, file]) => `${h} → ${file}`);
    expect(missing).toEqual([]);
  });

  /**
   * THE CARD SHAPE IS MEASURED FROM THE CARDS.
   *
   * --tarot-card was 1 / 1.72 — the proportions of a real tarot card, and a
   * perfectly reasonable thing to type. The 78 artwork files are not that
   * shape: their ratios run from 0.607 to 1.809. Held in a 1:1.72 box the
   * typical card floated in a letterbox with a third of the frame empty.
   *
   * This reads the actual files. If the deck is re-cut, or a card is replaced
   * with a differently-shaped one, the token has to move with it — which is a
   * thing nobody would otherwise notice until it was on a screen.
   */
  it('shapes the tarot card from the artwork that ships', () => {
    const dir = join(APP, 'public/assets/img/tarot');
    const files = readdirSync(dir).filter((f) => f.endsWith('.webp'));
    expect(files.length).toBe(78);

    const ratios = files.map((f) => {
      const b = readFileSync(join(dir, f));
      const tag = b.subarray(12, 16).toString('latin1');
      let w = 0, h = 0;
      if (tag === 'VP8X') { w = b.readUIntLE(24, 3) + 1; h = b.readUIntLE(27, 3) + 1; }
      else if (tag === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
      else if (tag === 'VP8L') { const n = b.readUInt32LE(21); w = (n & 0x3fff) + 1; h = ((n >> 14) & 0x3fff) + 1; }
      return h / w;
    }).filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);

    const median = ratios[Math.floor(ratios.length / 2)];
    const declared = strip(tokens).match(/--tarot-card:\s*1\s*\/\s*([\d.]+)/);
    expect(declared, '--tarot-card is not declared as `1 / n`').toBeTruthy();
    // Within 10% of the median: close enough that most cards fill their frame,
    // loose enough that re-exporting the deck does not fail the build over a
    // rounding difference.
    expect(Math.abs(Number(declared![1]) - median) / median).toBeLessThan(0.1);
  });

  /**
   * AND NOTHING HARD-CODES IT BESIDE THE TOKEN, or a back and a face disagree
   * and the card changes shape as it turns.
   */
  it('shares one card shape between the backs and the faces', () => {
    const tarot = strip(layout).split('\n').filter((l) => /tarot/.test(l) && /aspect-ratio/.test(l));
    expect(tarot.length).toBeGreaterThanOrEqual(3);
    expect(tarot.filter((l) => !l.includes('var(--tarot-card)'))).toEqual([]);
  });

  /**
   * A WASH IS A BACKGROUND. IT IS NEVER TEXT.
   *
   * --accent-soft and the status washes are near-white by definition — they
   * exist to sit BEHIND something. On the dark surfaces this design used to
   * have, cream-on-black was correct, and the colour sweep did not catch these
   * because they are tokens, not hexes. When those surfaces turned white the
   * text turned invisible, and the page it happened to was the one whose
   * heading says "Birth Details".
   *
   * Nothing failed. The typecheck passed, every test passed, the contrast
   * audit passed — because none of them can see that a colour and its
   * background became the same colour.
   */
  it('never paints text with a background wash', () => {
    const WASH = /(?<![-\w])color:\s*'var\(--(accent-soft|ok-soft|warn-soft|danger-soft|info-soft|gold-soft|green-soft|blue-soft|rose-soft|purple-soft)\)'/;
    // CookMode is a full-screen near-black theatre — the one surface in the
    // application where a near-white wash IS the readable colour. It is named
    // rather than pattern-matched, so it has to be re-argued if it changes.
    const ON_A_DARK_STAGE = ['src/features/nutrition/components/CookMode.tsx'];
    const offenders: string[] = [];
    for (const file of PAGES) {
      if (ON_A_DARK_STAGE.includes(file)) continue;
      const m = stripTs(read(file)).match(new RegExp(WASH.source, 'g'));
      if (m) offenders.push(`${file} → ${[...new Set(m)].join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * AND NEAR-WHITE TEXT NEEDS SOMETHING DARK UNDER IT.
   *
   * Light type is correct on exactly one kind of surface in this design: a
   * photograph with a scrim over it. Anywhere else it is the same defect as
   * above wearing different syntax. A file that writes in near-white must also
   * paint something dark — a scrim, a media background, or a dark gradient.
   */
  it('only writes in near-white where something dark is painted', () => {
    const LIGHT = /color:\s*'rgba\(\s*2[0-5]\d\s*,\s*2[0-5]\d\s*,\s*2[0-5]\d/;
    // A dark paint is not always a dark LITERAL. Workout's theatre is
    // `linear-gradient(160deg, var(--ink), var(--ink))` — as black as it gets,
    // and invisible to a regex that only knows hexes and rgba.
    const DARK = /(--media-bg|var\(--ink\)|rgba\(\s*[0-2]?\d\s*,|#0[0-9a-f]|#1[0-9a-f])/i;
    const offenders: string[] = [];
    for (const file of PAGES) {
      const src = stripTs(read(file));
      if (!new RegExp(LIGHT.source).test(src)) continue;
      if (!new RegExp(DARK.source, 'i').test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
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
  /**
   * EVERY CUSTOM PROPERTY A SCREEN ASKS FOR IS ONE SOMEBODY DEFINED.
   *
   * `var(--surface-2)` survived the palette rewrite in two files. It does not
   * fail: an undefined custom property with no fallback resolves to nothing, so
   * the chip simply had no face and the transaction icon no disc, and both
   * looked deliberate. That is the whole danger — a dead token is invisible,
   * where a dead class at least leaves an unstyled element behind.
   *
   * A name counts as defined if ANYTHING declares it: tokens.css, any
   * stylesheet, or a component setting it inline. A `var(--x, fallback)` is
   * always fine, because the fallback is the definition.
   */
  it('never asks for a custom property nobody defines', () => {
    const CSS = [tokens, relief, layout, index].map(strip);
    const TS = PAGES.map((f) => stripTs(read(f)));

    const defined = new Set<string>();
    for (const text of [...CSS, ...TS]) {
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
      for (const m of text.matchAll(/'(--[\w-]+)'\s*:/g)) defined.add(m[1]);
    }

    const offenders: string[] = [];
    const files: Array<[string, string]> = [
      ['src/styles/tokens.css', CSS[0]], ['src/styles/relief.css', CSS[1]],
      ['src/styles/layout.css', CSS[2]], ['src/index.css', CSS[3]],
      ...PAGES.map((f, i) => [f, TS[i]] as [string, string]),
    ];
    for (const [name, text] of files) {
      // Only a var() with NO fallback can resolve to nothing.
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (!defined.has(m[1])) offenders.push(`${name}: ${m[1]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('references a font file the build can actually serve', () => {
    const urls = [...strip(relief).matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of new Set(urls)) {
      expect(u.startsWith('/assets/fonts/')).toBe(true);
    }
  });
});
