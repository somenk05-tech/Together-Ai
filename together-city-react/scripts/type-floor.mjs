#!/usr/bin/env node
/**
 * ── THE FLOOR UNDER THE TYPE ────────────────────────────────────────────────
 *
 * Measured on the live routine sheet: 261 text nodes below 12.5px, of which 32
 * were 9.5px and 48 were 10px. Nine-and-a-half point tracked capitals are a
 * caption on a printed page held at reading distance; on a laptop they are a
 * badge somebody has to lean in for, and one of them — ESSENTIAL / OPTIONAL /
 * HIGH VALUE — is the page saying how it reasoned about their money.
 *
 * A SWEEP IS THE WRONG SHAPE FOR THIS. 214 of these across the app is a debt,
 * and the repo already knows how it pays those: record today's number, fail if
 * it grows, lower it as work lands. `lint-ceiling.mjs` and
 * `dead-export-audit.mjs` are the same instrument. This one counts inline
 * `fontSize:` declarations below the floor.
 *
 * IT COUNTS INLINE STYLES ONLY, which is the honest scope and worth saying: a
 * `font-size` in a stylesheet is invisible to it. The drift this exists to stop
 * is the one that arrives a `style={{ fontSize: 9.5 }}` at a time in a page
 * component, which is where every one of the 212 is.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FLOOR = 11;
/** Today's number. Lower it when work lands; never raise it. */
const CEILING = 214;

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (n === 'node_modules' || n.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
});

const offenders = [];
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/fontSize:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
    if (Number(m[1]) < FLOOR) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${file}:${line}  fontSize: ${m[1]}`);
    }
  }
}

const n = offenders.length;
if (n > CEILING) {
  console.error(`type floor: ${n} inline font sizes under ${FLOOR}px, ceiling is ${CEILING}.`);
  console.error('New ones, or the ceiling is wrong. The list:');
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
if (n < CEILING) {
  console.log(`type floor: ${n} under ${FLOOR}px — below the ceiling of ${CEILING}. Lower CEILING in scripts/type-floor.mjs to ${n} and keep it there.`);
  process.exit(0);
}
console.log(`type floor: ${n}, at the ceiling. No worse than before.`);
