import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(APP, dir))) {
    const rel = join(dir, name);
    if (statSync(join(APP, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

/**
 * THE HOLE CLAUDE.md NAMES, CLOSED.
 *
 * `scripts/motion-ceiling.mjs` counts CSS declarations. It cannot see a
 * `motion.div` carrying `transition={{ duration: 0.32 }}`, so the drift the
 * ceiling exists to stop — twelve slightly different durations nobody chose —
 * can walk straight back in through the library, invisibly, one component at a
 * time. The repo's own guidance says so in as many words and then has to trust
 * whoever reads it.
 *
 * This is the ratchet for that. A timing inside a motion prop must come from a
 * NAMED constant, so there is one place to change it and one thing to disagree
 * with. The number itself may live wherever the constant does; what may not
 * exist is a second, anonymous one three files away.
 *
 * Deliberately narrow: it reads only files that import the motion library, and
 * only the properties that carry timing. A component that never animates is
 * none of its business.
 */
describe('motion props name their timing', () => {
  const files = walk('src').filter((f) => /from '(framer-motion|motion\/react)'/.test(read(f)));

  it('is looking at the files that actually use the library', () => {
    // If this ever reaches zero the guard has quietly stopped guarding —
    // an import renamed, a path moved — and would pass forever after.
    expect(files.length).toBeGreaterThan(0);
  });

  it('never hand-types a duration, a delay or a stiffness inside a motion prop', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = strip(read(f));
      // Where the named constants live. A timing is allowed to be a number
      // HERE and nowhere else — one declaration is a decision, a second one
      // inline three lines later is the drift the CSS ceiling cannot see.
      const allowed: Array<[number, number]> = [
        ...src.matchAll(/const\s+[A-Z_][A-Z0-9_]*\s*=\s*\{[^}]*\}/g),
      ].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
      const inside = (i: number) => allowed.some(([a, b]) => i >= a && i < b);
      for (const m of src.matchAll(/\b(duration|delay|stiffness|damping|bounce)\s*:\s*[\d.]+/g)) {
        if (!inside(m.index ?? 0)) offenders.push(`${f} → ${m[0].replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The other half of the same rule, and the one that breaks a page rather than
   * a palette: a drag that does not lock its direction steals the list's
   * vertical scroll from a diagonal thumb.
   */
  it('locks the direction of every horizontal drag', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = strip(read(f));
      if (!/drag=("x"|'x'|\{'x'\})/.test(src)) continue;
      if (!/dragDirectionLock/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
