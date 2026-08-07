#!/usr/bin/env node
/**
 * Motion tokens, held to a ceiling instead of to zero.
 *
 * The motion audit counted THIRTY-SIX distinct duration literals against three
 * declared duration tokens, and not one hand-typed value equalled a token:
 * `.2s` is used twenty-one times and is twenty milliseconds off --dur-base.
 * Eight distinct timing functions ship where the file declares two, and
 * thirty-three transition declarations carry no timing function at all, so they
 * silently take the browser's weakest built-in curve.
 *
 * This is the same disease as the thirty-nine font sizes and the seven hundred
 * raw radii: token drift, which is the failure mode of a design system that is
 * WORKING — people reach for the system, miss by ten milliseconds, and ship.
 *
 * A sweep of a hundred sites in one commit is unreviewable, so this does what
 * lint-ceiling.mjs and dead-export-audit.mjs already do here: records today's
 * number, fails when it grows, and fails when it shrinks without the ceiling
 * being lowered. A ceiling nobody ratchets is just a high number that drifts
 * back up to meet it.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
const ceilingFile = join(here, 'motion-ceiling.json');
const ceiling = JSON.parse(readFileSync(ceilingFile, 'utf8'));

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.css', '.tsx', '.ts'].includes(extname(p))) files.push(p);
  }
})(src);

/* Every `transition:` / `animation:` value in the tree, CSS and inline alike.
   The inline ones matter most — they are where the drift lives. */
const decls = [];
for (const f of files) {
  /* COMMENTS ARE NOT DECLARATIONS. The first run of this script counted the
     rationale comment that says `transition: all` as a `transition: all`. A
     guard that fails on the sentence explaining the fix is a guard nobody will
     keep. */
  const text = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  for (const m of text.matchAll(/\b(?:transition|animation)\s*:\s*(['"`]?)([^;'"`}\n]+)\1/g)) {
    decls.push({ file: f, value: m[2].trim() });
  }
}

/* A duration literal, excluding the reduced-motion escape hatches — `.01ms`
   and `.001ms` are deliberate accessibility overrides, not drift. */
const DUR = /(?<![\w.])(\d*\.?\d+)(ms|s)\b/g;
const durations = new Set();
for (const d of decls) {
  for (const m of d.value.matchAll(DUR)) {
    const ms = m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
    if (ms <= 1) continue;                       // .01ms / .001ms — a11y, not drift
    durations.add(`${m[1]}${m[2]}`);
  }
}

/* A timing function: a keyword, a cubic-bezier, a steps(), or a token. */
const EASE = /\b(cubic-bezier\([^)]*\)|steps\([^)]*\)|linear|ease-in-out|ease-out|ease-in|ease|step-end|step-start|var\(--[\w-]*ease[\w-]*\))/g;
const easings = new Set();
let noEasing = 0;
for (const d of decls) {
  const found = [...d.value.matchAll(EASE)].map((m) => m[1]);
  found.forEach((e) => easings.add(e));
  /* A declaration that names a duration but no curve. `animation: none` and
     bare property lists have no duration, so they are not drift either. */
  if (!found.length && DUR.test(d.value)) noEasing += 1;
  DUR.lastIndex = 0;
}

const transitionAll = decls.filter((d) => /^all\b/.test(d.value)).length;

const counts = { durations: durations.size, easings: easings.size, noEasing, transitionAll };

if (process.argv.includes('--update')) {
  writeFileSync(ceilingFile, `${JSON.stringify({ ...ceiling, ...counts }, null, 2)}\n`);
  console.log('Ceiling updated to', JSON.stringify(counts));
  process.exit(0);
}

const rows = [
  ['duration literals', counts.durations, ceiling.durations],
  ['easing values', counts.easings, ceiling.easings],
  ['decls with no easing', counts.noEasing, ceiling.noEasing],
  ['transition: all', counts.transitionAll, ceiling.transitionAll],
];

let bad = 0;
for (const [name, n, max] of rows) {
  const state = n > max ? 'WENT UP' : n < max ? 'went down — lower the ceiling' : 'ok';
  if (n !== max) bad += 1;
  console.log(`  ${name.padEnd(22)} ${String(n).padStart(4)}   ceiling ${String(max).padStart(4)}   ${state}`);
}

if (!bad) {
  console.log('\nMotion drift at the ceiling. No worse than before.');
  process.exit(0);
}
console.error(
  '\nRun `node scripts/motion-ceiling.mjs --update` and commit the new figures if you\n' +
  'lowered a number on purpose. If a number went UP, use a token: the three\n' +
  'durations and the two curves are in src/styles/tokens.css.\n',
);
process.exit(1);
