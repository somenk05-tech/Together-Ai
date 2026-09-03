#!/usr/bin/env node
/**
 * ── THE SIZE SYSTEM, WHICH DID NOT EXIST ────────────────────────────────────
 *
 * `relief.spec.ts` is 32 assertions and NOT ONE OF THEM CONSTRAINS A SIZE.
 * Grouped by concern they are 14 colour, 5 asset, 4 scoping, 3 font-family,
 * 2 depth, 2 dead-code, 2 motion — and nothing at all about how big anything
 * is. Measured against that gap: 47 distinct font sizes over ~4,000 call
 * sites, nine of them inside a 4.5px band; 39 line-heights, of which 484 sites
 * sit between 1.45 and 1.70; 45 tracking values including fourteen distinct
 * negatives; and 7,097 inline style objects against the ~5,754 last written
 * down — up 23% while nobody was counting.
 *
 * That last number is the argument for this file. A debt nobody measures grows;
 * a debt with a ceiling on it does not. This is the same instrument as
 * `lint-ceiling.mjs` and `motion-ceiling.mjs`: record today, fail if it grows,
 * lower it as work lands.
 *
 * ── TRACKING AND LINE-HEIGHT JOINED THE COUNT, 2 SEP ───────────────────────
 *
 * Owner: one font system for the entire website. The typeface half of that is
 * done and it was one commit — the SCALE half is 49 distinct letter-spacing
 * values over 577 sites and 46 line-heights over 791, and it is not one
 * commit and should not pretend to be.
 *
 * They are counted HERE rather than in a sixth script for the reason four
 * paragraphs down: five copies of the same directory walk is five places to
 * fix the day the walk is wrong. Two more lines, two more ceilings, moving
 * independently of the other four.
 *
 * WHY DISTINCT VALUES AND NOT CALL SITES. 577 tracked labels is not a
 * problem; 54 WAYS OF SAYING ONE is. Seven values between .04em and .10em are
 * seven afternoons, not seven intentions, and the difference between 1.55 and
 * 1.6 on 12.5px type is six tenths of a pixel — a number nobody chose and
 * nobody can see. Counting sites would punish the app for having a lot of
 * labels. Counting values punishes it for having a lot of opinions about the
 * same label, which is the actual debt.
 *
 * THE FIRST RUNG IS ALREADY IN. `--track-display: .22em`, from the owner's
 * reference, read by the three sites that had arrived at .22em separately.
 * Every value folded into a token from here lowers this number by one and
 * changes nothing on screen — which is the only kind of change this ratchet
 * should ever be paid with.
 *
 * ONE FILE, NOT FIVE, because five copies of the same directory walk is five
 * places to fix the day the walk is wrong. Each metric is its own line and its
 * own ceiling; they move independently.
 *
 * WHAT IT CANNOT SEE, and this is worth knowing before trusting a number: it is
 * regex over text, not an AST. `fontSize: size <= 34 ? 12 : 14` and
 * `Math.round(size / 2.8)` are invisible to it. The real drift is somewhat
 * worse than these figures, never better.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Today's numbers. Lower them as work lands; never raise one to make a build pass. */
/*
 * LOWERED 28 AUG, AND THE FONT-SIZE LINE IS WHY.
 *
 * `distinctFontSizes` had been reading 37 against a ceiling of 36 — over, on
 * every run, for long enough that red had become the normal colour of this
 * script. That is the same pathology `dead-token-audit` was rescued from
 * earlier the same day: a check that always fails teaches whoever runs it to
 * skim past the next real failure.
 *
 * Two singletons closed the gap, both of them a rounding away from a step that
 * already existed: the name on the dating match detail (29 → 30) and the
 * amount due on the pay sheet (32 → 30). Nothing was resized to make a number
 * move — they were the same size to the eye and a different size to the
 * ladder, which is exactly the drift this file was written to find.
 *
 * The three remaining one-offs were left alone deliberately, because they are
 * not steps on a type ladder and pretending otherwise would be worse than
 * counting them: `.42em` is a relative size inside a carat label, and `6px`
 * and `2.9px` are SVG user units in a press-day graphic drawn to a fixed
 * viewBox. The regex cannot tell those from UI type — the header of this file
 * already says it is not an AST — so they stay in the count, and the count
 * stays honest about including them.
 *
 * The other three ceilings come down to today's readings at the same time,
 * which is what the script's own closing line asks for on every green run.
 */
/*
 * LOWERED 1 SEP, and `inlineStyleBlocks` is why.
 *
 * It had been reading 6741 against 6691 — fifty over, red on every run, which
 * is the state this file's own header calls out: a check that always fails
 * teaches whoever runs it to skim past the next real failure. It had been red
 * long enough that the launch gate listed it as a blocker to landing anything.
 *
 * Fifty-seven of those objects were one declaration: `{ flex: 1, minWidth: 0 }`,
 * the flex child that is allowed to shrink. `.row .grow` in index.css had
 * carried exactly that since the row existed; it needed a `.row` parent, so
 * fifty-seven sites retyped it by hand instead. The class is unparented now and
 * they say `grow`. Nothing was resized and nothing moved on screen — the same
 * standard the 28 Aug lowering held itself to.
 *
 * Four more were `className="tag" style={{ fontSize: 10.5 }}` restating the
 * `.tag` class's own `var(--fs-1)`, which is 10.5px. Those also took the type
 * floor from 195 to 191.
 *
 * The other three ceilings come down to today's readings at the same time,
 * which is what the script's own closing line asks for on every green run.
 */
const CEILING = {
  rawRadii: 317,
  inlineStyleBlocks: 6678,
  distinctFontSizes: 35,
  rawSpacing: 3605,
  /* Added 2 Sep. Today's readings, recorded so they can only fall.
   *
   * `distinctTracking` opened at 50 and is recorded at 49, because the last
   * literal `.22em` in the application — the press day's rail label — was
   * folded into `--track-display` in the same pass. A ratchet whose first
   * number was never once lowered is a ratchet nobody has proved moves. */
  distinctTracking: 49,
  distinctLineHeights: 46,
};

const walk = (d, ext) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  if (n === 'node_modules' || n.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
});
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const tsx = walk('src', '.tsx');
const css = ['src/index.css', ...readdirSync('src/styles').map((f) => join('src/styles', f))]
  .filter((f) => f.endsWith('.css') && existsSync(f));

const n = { rawRadii: 0, inlineStyleBlocks: 0, rawSpacing: 0 };
const sizes = new Set();
const tracking = new Set();
const lineHeights = new Set();

/* A value written through a token is not a value somebody chose here — it is
   the token being read, which is the outcome this counts towards. `inherit`,
   `normal` and `unset` are the absence of a decision for the same reason. */
const counts = (v) => {
  const t = v.trim().replace(/\s*!important$/, '');
  return t !== '' && !t.startsWith('var(') && !/^(inherit|normal|unset|initial|revert)$/.test(t);
};

for (const f of tsx) {
  const s = noComments(readFileSync(f, 'utf8'));
  n.inlineStyleBlocks += (s.match(/style=\{\{/g) || []).length;
  n.rawRadii += [...s.matchAll(/borderRadius:\s*'?([0-9.]+)/g)].length;
  n.rawSpacing += [...s.matchAll(/(?:padding|margin|gap)(?:Top|Right|Bottom|Left|X|Y)?:\s*[0-9]+\b/g)].length;
  for (const m of s.matchAll(/fontSize:\s*'?([0-9.]+)/g)) sizes.add(m[1]);
  for (const m of s.matchAll(/letterSpacing:\s*'([^']+)'/g)) if (counts(m[1])) tracking.add(m[1].trim());
  for (const m of s.matchAll(/lineHeight:\s*'?([0-9.]+(?:px|em|rem)?)'?/g)) if (counts(m[1])) lineHeights.add(m[1].trim());
}
for (const f of css) {
  const s = noComments(readFileSync(f, 'utf8'));
  n.rawRadii += [...s.matchAll(/border-radius:\s*([0-9.]+)px/g)].length;
  for (const m of s.matchAll(/font-size:\s*([0-9.]+)px/g)) sizes.add(m[1]);
  for (const m of s.matchAll(/letter-spacing:\s*([^;}\n]+)/g)) if (counts(m[1])) tracking.add(m[1].trim());
  for (const m of s.matchAll(/line-height:\s*([^;}\n]+)/g)) if (counts(m[1])) lineHeights.add(m[1].trim());
}
n.distinctFontSizes = sizes.size;
n.distinctTracking = tracking.size;
n.distinctLineHeights = lineHeights.size;

const LABEL = {
  rawRadii: 'raw radii (not var(--r-*))',
  inlineStyleBlocks: 'inline style objects',
  distinctFontSizes: 'distinct font sizes',
  rawSpacing: 'raw inline spacing values',
  distinctTracking: 'distinct tracking values',
  distinctLineHeights: 'distinct line-heights',
};

let over = false, under = false;
for (const k of Object.keys(CEILING)) {
  const now = n[k], cap = CEILING[k];
  const state = now > cap ? 'OVER' : now < cap ? 'below' : 'ok';
  if (now > cap) over = true;
  if (now < cap) under = true;
  console.log(`  ${LABEL[k].padEnd(30)} ${String(now).padStart(6)}   ceiling ${String(cap).padStart(6)}   ${state}`);
}

if (over) {
  console.error('\nSize drift grew. Lower the number or raise nothing — the ceiling is the point.');
  process.exit(1);
}
if (under) {
  console.log('\nBelow the ceiling. Lower CEILING in scripts/size-system-ceiling.mjs to today’s numbers and keep it there.');
  process.exit(0);
}
console.log('\nSize drift at the ceiling. No worse than before.');
