#!/usr/bin/env node
/**
 * Lint, held to a ceiling instead of to zero. The web package's
 * scripts/lint-ceiling.mjs is the original; this is the same mechanism for the
 * API, and the two are deliberately identical in behaviour.
 *
 * WHY THIS PACKAGE GOT ONE LATE, AND WHAT IT COST. `npm run lint` here carried
 * `--fix`. A landing script added it as a step meant only to REPORT, and it
 * rewrote two unrelated files before failing on the backlog — a check that
 * mutates the tree it is checking. `--fix` now lives in `lint:fix`, where
 * somebody has to ask for it.
 *
 * ci.yml has always skipped lint on this package because it has never been
 * green and never will be in one go. A ceiling is the version that can run:
 * fails when the number goes UP, so new code is held to zero, and fails when it
 * goes DOWN without the ceiling being lowered, because a ceiling nobody
 * ratchets is just a high number that drifts back up to meet it.
 *
 * The scope is the same glob `npm run lint` uses. A ceiling measuring a
 * different set of files from the command people run is a ceiling that argues
 * with them.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ceilingFile = join(here, 'lint-ceiling.json');
const ceiling = JSON.parse(readFileSync(ceilingFile, 'utf8'));

let report;
try {
  // ESLint exits non-zero when it finds errors, which is the normal case here.
  report = execFileSync('npx', ['eslint', 'src/**/*.ts', 'test/**/*.ts', '-f', 'json'], {
    cwd: join(here, '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  report = e.stdout;
  if (!report) {
    console.error('Could not run ESLint:', e.message);
    process.exit(2);
  }
}

const files = JSON.parse(report);
const errors = files.reduce((n, f) => n + f.errorCount, 0);
const worst = files
  .filter((f) => f.errorCount)
  .sort((a, b) => b.errorCount - a.errorCount)
  .slice(0, 5)
  .map((f) => `    ${String(f.errorCount).padStart(3)}  ${f.filePath.split('/src/').pop()}`);

if (process.argv.includes('--update')) {
  writeFileSync(ceilingFile, `${JSON.stringify({ ...ceiling, errors }, null, 2)}\n`);
  console.log(`Ceiling updated to ${errors}.`);
  process.exit(0);
}

if (errors > ceiling.errors) {
  console.error(
    `\nLint errors went UP: ${errors}, ceiling is ${ceiling.errors}.\n` +
      `Fix what this change introduced — the backlog is not your problem, but adding to it is.\n\n` +
      `Worst files right now:\n${worst.join('\n')}\n`,
  );
  process.exit(1);
}

if (errors < ceiling.errors) {
  console.error(
    `\nLint errors went DOWN: ${errors}, ceiling is still ${ceiling.errors}. Thank you — now lower it:\n\n` +
      `    node scripts/lint-ceiling.mjs --update\n\n` +
      `and commit scripts/lint-ceiling.json.\n`,
  );
  process.exit(1);
}

console.log(`API lint errors: ${errors}, at the ceiling. No worse than before.`);
