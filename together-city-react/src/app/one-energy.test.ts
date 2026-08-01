import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(web, '../../together-city-chat/src');

/**
 * ONE ENERGY COMPUTATION, in either package.
 *
 * The daily calorie target is computed by shared/energy.ts in the API and
 * nowhere else. There were four Mifflin-St Jeor implementations at the start
 * of this: shared/energy.ts, Nutrition's engine before unification,
 * computeBodyProgram before 50eaf55, and Workout.tsx — each a different
 * number for the same person, settled by which page they were looking at.
 *
 * This scans both source trees for the equation's two tell-tale coefficients:
 * the height term and the female constant. If either appears outside
 * shared/energy.ts, somebody is writing the fifth implementation.
 *
 * Comments are stripped before scanning — a guard that reads prose has been
 * fooled four times in this repo already — and the literals are assembled at
 * runtime so this file cannot trip itself.
 */
const HEIGHT_TERM = new RegExp('\\b6\\.' + '25\\b');
const FEMALE_TERM = new RegExp('-\\s*' + '161\\b');
const ALLOWED = ['shared/energy.ts', 'shared/energy.spec.ts', 'app/one-energy.test.ts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__snapshots__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('one energy computation', () => {
  it('no Mifflin-St Jeor arithmetic outside shared/energy.ts, in either package', () => {
    const offenders: string[] = [];
    for (const f of [...walk(web), ...walk(api)]) {
      const rel = f.replace(/\\/g, '/');
      if (ALLOWED.some((a) => rel.endsWith(a))) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      if (HEIGHT_TERM.test(src) || FEMALE_TERM.test(src)) offenders.push(rel.split('/src/').pop() ?? rel);
    }
    expect(offenders, [
      '',
      'The Mifflin-St Jeor coefficients appear outside shared/energy.ts.',
      'The daily calorie target is computed once, on the server. Render it;',
      'do not recompute it.',
      '',
    ].join('\n')).toEqual([]);
  });
});
