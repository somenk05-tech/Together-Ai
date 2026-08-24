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
const CEILING = {
  rawRadii: 328,
  inlineStyleBlocks: 6768,
  distinctFontSizes: 36,
  rawSpacing: 3672,
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

for (const f of tsx) {
  const s = noComments(readFileSync(f, 'utf8'));
  n.inlineStyleBlocks += (s.match(/style=\{\{/g) || []).length;
  n.rawRadii += [...s.matchAll(/borderRadius:\s*'?([0-9.]+)/g)].length;
  n.rawSpacing += [...s.matchAll(/(?:padding|margin|gap)(?:Top|Right|Bottom|Left|X|Y)?:\s*[0-9]+\b/g)].length;
  for (const m of s.matchAll(/fontSize:\s*'?([0-9.]+)/g)) sizes.add(m[1]);
}
for (const f of css) {
  const s = noComments(readFileSync(f, 'utf8'));
  n.rawRadii += [...s.matchAll(/border-radius:\s*([0-9.]+)px/g)].length;
  for (const m of s.matchAll(/font-size:\s*([0-9.]+)px/g)) sizes.add(m[1]);
}
n.distinctFontSizes = sizes.size;

const LABEL = {
  rawRadii: 'raw radii (not var(--r-*))',
  inlineStyleBlocks: 'inline style objects',
  distinctFontSizes: 'distinct font sizes',
  rawSpacing: 'raw inline spacing values',
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
