import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const src = join(__dirname, '..');

/**
 * Nobody matches a declared allergy with a substring test again.
 *
 * FIVE TIMES, IN THREE HUBS, AND NOBODY COPIED IT FROM ANYBODY.
 *
 * allergens.ts describes the first: nutrition.service.ts's allergySafe() did a
 * plain `includes` on the term as typed, "milk" is not in "paneer", and the
 * simulations reported "Allergen leaks: 0" because the leak was measured with
 * the same substring test the filter enforced. RELEASE-GATE.md carried that zero
 * as a hard safety gate. It was a tautology.
 *
 * Beauty then wrote it three more times — beauty-engine, beauty-analysis,
 * look-decode — two of them under comments claiming the property they lacked.
 * Restaurants wrote it a fifth time, against a concatenated menu blob, under the
 * comment `// allergy = never shown`.
 *
 * That is the whole argument for a guard rather than five fixes. It is simply
 * what `includes` looks like when you reach for the obvious thing, and the
 * obvious thing is wrong. The fix was already in the repo, tested adversarially,
 * and believed — in a folder the other three hubs had no reason to import from.
 *
 * So the shape is banned rather than the instance fixed. A line that mentions an
 * allergy AND does substring containment is what this looks for. It is crude,
 * and it is aimed at exactly the moment somebody writes the fourth one.
 */
const ALLOW = new Set<string>([
  // The word-boundary matchers themselves. These two files ARE the answer.
  'shared/allergens.ts',
  'shared/topical-sensitivities.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p) && !/\.spec\.ts$/.test(p)) out.push(p);
  }
  return out;
}

describe('how a declared allergy is matched', () => {
  it('is never a substring test', () => {
    const offenders: string[] = [];

    for (const p of walk(src)) {
      const rel = relative(src, p).split('\\').join('/');
      if (ALLOW.has(rel)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        if (!/allerg|sensitivit/i.test(line)) return;
        if (/\.includes\(|\.indexOf\(|\.startsWith\(|\.endsWith\(/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
        }
      });
    }

    if (offenders.length) {
      throw new Error([
        '',
        'These match a declared allergy by substring. "tree nuts" is not a substring',
        'of "almond oil" and "salicylates" is not a substring of "salicylic acid", so',
        'the terms people actually write pass straight through.',
        '',
        'Use findAllergen (food) or findSensitivity (topical) from shared/. Both match',
        'on whole words and expand a declared term into the family it means.',
        '',
        ...offenders,
        '',
      ].join('\n'));
    }
    expect(offenders).toEqual([]);
  });

  it('every call site uses a shared matcher', () => {
    // Named individually so deleting one import fails with the reason rather
    // than as a silent drop in coverage.
    const expected: Array<[string, string]> = [
      ['beauty/beauty-engine.ts', 'topical-sensitivities'],
      ['beauty/beauty-analysis.ts', 'topical-sensitivities'],
      ['beauty/look-decode.ts', 'topical-sensitivities'],
      ['restaurants/restaurants.service.ts', 'shared/allergens'],
      ['nutrition/nutrition.service.ts', 'shared/allergens'],
      ['nutrition/meal-composer.ts', 'shared/allergens'],
    ];
    for (const [f, mod] of expected) {
      const s = readFileSync(join(src, f), 'utf8');
      if (!s.includes(mod)) throw new Error(`${f} no longer imports ${mod}`);
    }
  });
});
