#!/usr/bin/env node
/**
 * Exports nothing imports — held to a ceiling, like lint and a11y.
 *
 * This exists because of a specific, expensive day. The nutrition hub had two
 * complete meal-planning systems, and only one was reachable. Thirteen
 * endpoints, three tables and a large body of service code sat behind ten React
 * hooks that nothing called. It cost two wrong commits before anybody noticed:
 * a performance fix aimed at a query on the unreachable path, and a whole
 * feature built against rows the page never reads — which would have shipped a
 * button that reported success and changed nothing.
 *
 * Neither mistake was careless. Both were made by reading the code and
 * believing what it said, and the code said there were two ways to do the same
 * thing. Nothing in the build could tell you one of them was dead.
 *
 * nav-audit already checks that every link points at a route that exists. This
 * is the other direction: an exported function that nothing imports is a road
 * with no traffic, and roads with no traffic are where features get built by
 * mistake.
 *
 * WHAT THIS DOES NOT DO. It reads imports, not calls — a symbol imported and
 * then unused still counts as reached. It cannot see across to the API package,
 * so a backend route with no client is still invisible here. It skips anything
 * a test imports, because a tested helper is doing a job. It is a floor under
 * one specific way of getting lost, not a proof of liveness.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'src');
const ceilingFile = join(here, 'dead-export-ceiling.json');

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(root);

const source = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

/**
 * Entry points and their kin are exempt: a route component is imported by the
 * router through a lazy() string, a type may be used only structurally, and a
 * default export has no name to search for.
 */
const EXEMPT_FILE = /\/(main|App)\.tsx?$|\/app\/router\.tsx$|\.d\.ts$/;
/** Names too short or too common to search for honestly. */
const TOO_GENERIC = new Set(['default', 'Props', 'State']);

/**
 * Comments are not uses.
 *
 * This guard used to count an export as reached if its NAME appeared anywhere in
 * another file — and a name appears in prose about it as readily as in a call.
 * Three dead components were held alive that way: MealCard and MedicalAdvisories
 * by one sentence in a test's doc comment, and useBuildFamilyCart by the comment
 * in Weekly.tsx explaining why it is NOT used. The ceiling read 2 while the real
 * number was 5.
 *
 * Same failure as the absence checks in the app's other guards, and the same
 * fix: read the code, not the explanation above it. String literals are left
 * alone deliberately — a name in a string can be a real dynamic reference.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const exportsOf = (src) => {
  const out = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    out.push(m[1]);
  }
  return out;
};

const findings = [];
for (const file of files) {
  if (EXEMPT_FILE.test(file)) continue;
  const rel = relative(root, file);
  for (const name of exportsOf(source.get(file))) {
    if (TOO_GENERIC.has(name)) continue;
    const word = new RegExp(`\\b${name}\\b`, 'g');
    // Used inside its own module counts as reached. An api object that only its
    // own hooks call is an over-broad export, not a dead one, and reporting it
    // here would bury the finding this guard exists for under dozens of them.
    const ownUses = (stripComments(source.get(file)).match(word) ?? []).length;
    let reached = ownUses > 1;
    if (!reached) {
      for (const [other, src] of source) {
        if (other === file) continue;
        if (word.test(stripComments(src))) { reached = true; break; }
        word.lastIndex = 0;
      }
    }
    if (!reached) findings.push(`${rel}  ${name}`);
  }
}

if (process.argv.includes('--list')) {
  for (const f of findings.sort()) console.log('  ' + f);
  console.log('');
}

const ceiling = JSON.parse(readFileSync(ceilingFile, 'utf8'));
const total = findings.length;

if (process.argv.includes('--update')) {
  writeFileSync(ceilingFile, `${JSON.stringify({ ...ceiling, total }, null, 2)}\n`);
  console.log(`dead-export ceiling set to ${total}.`);
  process.exit(0);
}
if (total > ceiling.total) {
  console.error(`\nExports nothing imports went UP: ${total}, ceiling is ${ceiling.total}.`);
  console.error('Something new is unreachable. Either wire it up or delete it —');
  console.error('an export with no importer is where a feature gets built by mistake.');
  console.error('\nRun with --list to see them.\n');
  process.exit(1);
}
if (total < ceiling.total) {
  console.log(`\nExports nothing imports went DOWN: ${total}, ceiling is still ${ceiling.total}. Thank you — now lower it:\n`);
  console.log('    node scripts/dead-export-audit.mjs --update\n');
  console.log('and commit scripts/dead-export-ceiling.json.\n');
  process.exit(0);
}
console.log(`Exports nothing imports: ${total}, at the ceiling. No worse than before.`);
