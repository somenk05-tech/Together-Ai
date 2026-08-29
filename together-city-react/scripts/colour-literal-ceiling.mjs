#!/usr/bin/env node
/**
 * ── THE HOLE IN THE COLOUR GUARD ────────────────────────────────────────────
 *
 * `relief.spec.ts` has two colour guards and both are narrower than they read.
 * The first flags CHROMATIC hex only, so every achromatic literal passes; the
 * second reads `relief.css` alone, matches `background` only, and its pattern
 * covers `#fff`, `#000` and `rgba(255,255,255…)` — so `rgba(0,0,0,…)` and the
 * space syntax `rgb(0 0 0 / .1)` are invisible to it.
 *
 * The hole was described in CLAUDE.md as "an rgba() literal in a .tsx file
 * slips through". It is wider than that: the hole is in the CSS guard too, and
 * of 96 literals found outside tokens.css in the stylesheets, 81 were exactly
 * that form. `.ask-cta` duplicating `--loud-face` byte-for-byte in layout.css
 * — so the city's loudest button stayed black in a hub that re-points it — is
 * what that hole costs.
 *
 * WHY A CEILING AND NOT AN ASSERTION. There are still 294 of these. A guard
 * that fails today is a guard somebody deletes; a ceiling that cannot rise is
 * one they lower. When either number reaches zero, promote it into
 * relief.spec.ts as a hard assertion and delete its line here.
 *
 * `tokens.css` is exempt by definition — it is where colour lives.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Today's numbers. */
const CEILING = { css: 75, tsx: 153 };

const walk = (d, ext) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  if (n === 'node_modules' || n.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
});
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const LITERAL = /rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b/g;

const cssFiles = ['src/index.css', ...readdirSync('src/styles').map((f) => join('src/styles', f))]
  .filter((f) => f.endsWith('.css') && existsSync(f) && !f.endsWith('tokens.css'));

let css = 0;
const worst = [];
for (const f of cssFiles) {
  const c = (strip(readFileSync(f, 'utf8')).match(LITERAL) || []).length;
  css += c; if (c) worst.push(`${c.toString().padStart(4)}  ${f}`);
}
let tsx = 0;
for (const f of walk('src', '.tsx')) {
  tsx += (strip(readFileSync(f, 'utf8')).match(/rgba?\(\s*[\d.]|hsla?\(\s*[\d.]/g) || []).length;
}

console.log(`  colour literals in css   ${String(css).padStart(5)}   ceiling ${String(CEILING.css).padStart(5)}`);
for (const w of worst) console.log(`      ${w}`);
console.log(`  colour literals in tsx   ${String(tsx).padStart(5)}   ceiling ${String(CEILING.tsx).padStart(5)}`);

if (css > CEILING.css || tsx > CEILING.tsx) {
  console.error('\nA colour was written outside tokens.css. Point it at a token, or lower nothing and explain.');
  process.exit(1);
}
if (css < CEILING.css || tsx < CEILING.tsx) {
  console.log(`\nBelow the ceiling. Set CEILING to { css: ${css}, tsx: ${tsx} } in scripts/colour-literal-ceiling.mjs.`);
  process.exit(0);
}
console.log('\nColour literals at the ceiling. No worse than before.');
