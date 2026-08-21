#!/usr/bin/env node
/**
 * ── A TOKEN NOBODY READS IS A COLOUR OUTSIDE THE SYSTEM ─────────────────────
 *
 * tokens.css is the one file colour lives in, which makes an unread name there
 * worse than an unread export elsewhere: it reads as part of the palette, it
 * gets re-pointed by hubs that spend a declaration on it, and it is the first
 * thing somebody reaches for when they want the colour it seems to name.
 *
 * The clean-out that produced this ceiling found fifteen: seven legacy accent
 * shims (--blue, --blue-soft, --rose-soft, --purple, --purple-soft, --navy,
 * --emerald) that existed so nothing had to be renamed at three hundred call
 * sites, and which nothing had ever called; --glass-dock, four lines of
 * frosted capsule for a dock that draws its own material; --sky-pos and
 * --sky-size, knobs nobody turned because every sky is a gradient that fills
 * its own box; the four pre-Relief --pane names aliasing four Relief ones; and
 * --soft-out, a depth the shadow guard would have accepted and nothing drew at.
 * Entertainment was spending two of its declarations re-pointing --purple and
 * --navy, with a paragraph of reasoning attached to names no rule could reach.
 *
 * A SCALE IS NOT DEBT AND IS EXEMPT. --space-*, --fs-*, --r-* and --s-* are
 * menus: a ladder with an unused rung is still a ladder, and the whole point of
 * declaring one is that the next size is chosen from a list rather than typed.
 * The distinction is the rule, not a loophole — an unread ALIAS is a name
 * pretending to be a colour; an unread STEP is a colour waiting for a caller.
 *
 * WHAT IT CANNOT SEE: a token assembled at runtime, `var(--x${n})`. There are
 * none today; if one appears, name it in KNOWN_DYNAMIC rather than widening
 * the scan, so the exception is a list somebody can read.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Today's number. Lower it as names go; never raise it. */
const CEILING = 0;

/** Steps of a declared scale. A menu, not debt — see the note above. */
const SCALE = /^--(space|fs|r|s)-[0-9]+$/;
/** Read from JavaScript in a form the scan cannot match. Empty, deliberately. */
const KNOWN_DYNAMIC = [];

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  if (n === 'node_modules' || n.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(css|ts|tsx)$/.test(p) ? [p] : [];
});

const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const declared = new Set();
for (const m of tokens.matchAll(/:root\s*\{/g)) {
  let depth = 1, i = m.index + m[0].length;
  const start = i;
  while (depth > 0 && i < tokens.length) {
    if (tokens[i] === '{') depth++;
    else if (tokens[i] === '}') depth--;
    i++;
  }
  for (const t of tokens.slice(start, i - 1).matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(t[1]);
}

const read = new Set(KNOWN_DYNAMIC);
for (const f of walk('src')) {
  const s = readFileSync(f, 'utf8');
  // `var(--x)` in a stylesheet or an inline style, and the string form a
  // component passes to setProperty or stores in a config object.
  for (const m of s.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) read.add(m[1]);
  for (const m of s.matchAll(/['"`](--[a-z0-9-]+)['"`]/g)) read.add(m[1]);
}

const unread = [...declared].filter((t) => !read.has(t)).sort();
const dead = unread.filter((t) => !SCALE.test(t));
const rungs = unread.filter((t) => SCALE.test(t));

console.log(`  tokens declared at :root   ${String(declared.size).padStart(4)}`);
console.log(`  unread scale steps         ${String(rungs.length).padStart(4)}   exempt — a ladder is a menu`);
console.log(`  dead tokens                ${String(dead.length).padStart(4)}   ceiling ${CEILING}`);
for (const t of dead) console.log(`      ${t}`);

if (dead.length > CEILING) {
  console.error('\nA token was added that nothing reads, or a caller went away and left the name behind.');
  process.exit(1);
}
if (dead.length < CEILING) {
  console.log(`\nBelow the ceiling. Set CEILING to ${dead.length} in scripts/dead-token-audit.mjs.`);
  process.exit(0);
}
console.log('\nNo dead tokens. Every name at :root has a reader.');
