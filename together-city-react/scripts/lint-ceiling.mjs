#!/usr/bin/env node
/**
 * Lint, held to a ceiling instead of to zero.
 *
 * `npm run lint` reports around a hundred errors and has for long enough that
 * nobody looks at it. Wiring that into CI would fail every single run, which
 * does not fix the errors — it teaches people that a red pipeline is normal,
 * and that is a worse position than having no pipeline at all.
 *
 * So this fails only when the number goes UP. New code is held to zero, because
 * any error a change introduces pushes the count past the ceiling. The backlog
 * gets paid down whenever somebody is in one of those files for another reason.
 *
 * It also fails when the count goes DOWN without the ceiling being lowered.
 * That looks pedantic and is the entire mechanism: a ceiling nobody ratchets is
 * just a high number that drifts back up to meet it. Fixing errors and
 * committing the new figure is one line of work and keeps the guarantee real.
 *
 * Same shape as the frozen lists in the API's src/security/ — a number nobody
 * may quietly grow.
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
  report = execFileSync('npx', ['eslint', '.', '-f', 'json'], {
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
      `and commit scripts/lint-ceiling.json. A ceiling nobody ratchets is just a\n` +
      `high number that drifts back up to meet it.\n`,
  );
  process.exit(1);
}

console.log(`Lint errors: ${errors}, at the ceiling. No worse than before.`);
