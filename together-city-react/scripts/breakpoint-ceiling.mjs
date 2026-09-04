#!/usr/bin/env node
/**
 * ── THE BREAKPOINTS NOBODY COUNTED ──────────────────────────────────────────
 *
 * `relief.spec.ts` constrains colour, depth, family and asset. `size-system-
 * ceiling.mjs` constrains how big type is. Nothing constrained WHERE the layout
 * changes, and the drift showed: 31 distinct media-query widths written across
 * four stylesheets, from 374px to 1800px, chosen per component rather than
 * against a scale. Four of them — 374, 380, 400, 480 — all mean "a small
 * phone".
 *
 * TWO OF THEM WERE A BUG, not just drift, and they are the reason this file
 * exists rather than a note in CLAUDE.md:
 *
 *   - `max-width: 900px` sat beside `min-width: 900px`. At exactly 900px BOTH
 *     matched, so the phone rule and the desktop rule applied to the same
 *     element at the same time. The mobile side is now spelled 899px, which is
 *     the complement `min-width: 900px` always wanted.
 *   - `max-width: 1099px` sat beside `max-width: 1100px` with no min-width
 *     partner for either — two names for one intent, one pixel apart.
 *
 * A DEAD ZONE IS INVISIBLE UNTIL SOMEBODY RESIZES TO THE EXACT PIXEL, which is
 * why counting is the right instrument here and a sweep is not. Same shape as
 * `lint-ceiling.mjs`, `motion-ceiling.mjs` and `size-system-ceiling.mjs`:
 * record today, fail if it grows, lower it as work lands.
 *
 * `overlaps` and `collisions` are the defects and are held at ZERO.
 * `boundaries` is the debt — a max-width and the min-width one pixel above it
 * are ONE boundary written from both sides, and count once, so spelling a pair
 * correctly never scores worse than overlapping it did. That number, and it comes down as blocks are merged onto the four the app
 * actually needs: 560 · 900 · 1180 · 1500.
 *
 * IT READS STYLESHEETS ONLY. A width comparison in TypeScript — a
 * `matchMedia`, a `window.innerWidth <` — is invisible to it. That is the
 * honest scope: this counts where the CSS changes its mind, nothing else.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const ceilingFile = join(here, 'breakpoint-ceiling.json');
const ceiling = JSON.parse(readFileSync(ceilingFile, 'utf8'));

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.css')) files.push(full);
  }
})(srcDir);

const maxes = new Map();
const mins = new Map();
for (const file of files) {
  const css = readFileSync(file, 'utf8');
  for (const m of css.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)) {
    const bucket = m[1] === 'max' ? maxes : mins;
    const px = Number(m[2]);
    bucket.set(px, (bucket.get(px) ?? 0) + 1);
  }
}

// A `max-width: 899px` and a `min-width: 900px` are ONE boundary written from
// its two sides, not two breakpoints. Count the boundary, so spelling a pair
// correctly never reads as more drift than overlapping it did.
const boundary = (px, kind) => (kind === 'max' ? px + 1 : px);
const boundaries = [
  ...new Set([
    ...[...maxes.keys()].map((px) => boundary(px, 'max')),
    ...[...mins.keys()].map((px) => boundary(px, 'min')),
  ]),
].sort((a, b) => a - b);
const all = [...new Set([...maxes.keys(), ...mins.keys()])].sort((a, b) => a - b);

// A max-width and a min-width at the SAME px: both match at exactly that width.
const overlapping = [...maxes.keys()].filter((px) => mins.has(px)).sort((a, b) => a - b);

// Two breakpoints on the same side within 2px: two names for one intent.
const colliding = [];
for (const bucket of [maxes, mins]) {
  const keys = [...bucket.keys()].sort((a, b) => a - b);
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i] - keys[i - 1] <= 2) colliding.push(`${keys[i - 1]}/${keys[i]}`);
  }
}

const counts = { boundaries: boundaries.length, overlaps: overlapping.length, collisions: colliding.length };

if (process.argv.includes('--update')) {
  writeFileSync(ceilingFile, `${JSON.stringify({ ...ceiling, ...counts }, null, 2)}\n`);
  console.log('Ceiling updated to', JSON.stringify(counts));
  process.exit(0);
}

const rows = [
  ['layout boundaries', counts.boundaries, ceiling.boundaries],
  ['max/min at same px', counts.overlaps, ceiling.overlaps],
  ['within 2px of each other', counts.collisions, ceiling.collisions],
];

let bad = 0;
for (const [name, n, max] of rows) {
  const state = n > max ? 'WENT UP' : n < max ? 'went down — lower the ceiling' : 'ok';
  if (n !== max) bad += 1;
  console.log(`  ${name.padEnd(26)} ${String(n).padStart(4)}   ceiling ${String(max).padStart(4)}   ${state}`);
}

if (overlapping.length) console.log(`\n  both sides at: ${overlapping.join(', ')}`);
if (colliding.length) console.log(`  one pixel apart: ${colliding.join(', ')}`);

if (!bad) {
  console.log('\nBreakpoint drift at the ceiling. No worse than before.');
  console.log(`Boundaries: ${boundaries.join(' ')}`);
  console.log(`Written as:  ${all.join(' ')}`);
  process.exit(0);
}
console.error(
  '\nRun `node scripts/breakpoint-ceiling.mjs --update` and commit the new figures\n' +
  'if you lowered a number on purpose. If a number went UP: the app has four\n' +
  'breakpoints — 560 · 900 · 1180 · 1500 — and a new block belongs on the\n' +
  'nearest one. Spell the mobile side of 900 as 899px, so it stays the\n' +
  'complement of `min-width: 900px` rather than overlapping it at that pixel.\n',
);
process.exit(1);
