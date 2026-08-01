import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(web, '../../together-city-chat/src');

/**
 * One activity scale across two packages.
 *
 * There were three. shared/energy.ts held 1.2 / 1.375 / 1.55 / 1.725 / 1.9 and
 * called them sedentary…veryActive. The Preferences form offered 1.2 / 1.4 / 1.6
 * / 1.8 / 2.0. fitness-engine.ts derived 1.3 / 1.4 / 1.5 / 1.6 / 1.75 from the
 * citizen's ABILITY rating, which is a different question altogether.
 *
 * All three multiply a BMR into a daily calorie target. "Athlete" meant 2.0 in
 * the form and 1.75 in Fitness: a 14% difference in the same person's energy
 * needs, settled by which page they were looking at.
 *
 * The form cannot import from the API package, so this reads both files and
 * compares the numbers. Crude, and it is the only thing standing between here
 * and a fourth scale.
 */
const factors = (src: string, re: RegExp): number[] => {
  const out: number[] = [];
  for (const m of src.matchAll(re)) out.push(Number(m[1]));
  return out;
};

describe('the activity scale', () => {
  it('is the same five numbers in the form and in the engine', () => {
    const server = readFileSync(join(api, 'shared/energy.ts'), 'utf8');
    const form = readFileSync(join(web, 'features/nutrition/pages/Preferences.tsx'), 'utf8');

    const block = server.slice(server.indexOf('export const ACTIVITY_FACTORS'));
    const serverFactors = factors(block.slice(0, block.indexOf('} as const')), /:\s*([\d.]+),/g);
    const formValues = factors(
      form.slice(form.indexOf('const ACTIVITY:'), form.indexOf('const CUISINES')),
      /value:\s*([\d.]+),/g,
    );

    expect(serverFactors).toHaveLength(5);
    expect(formValues, [
      '',
      'The Preferences form offers activity multipliers the engine does not use.',
      `  form:   ${formValues.join(' / ')}`,
      `  engine: ${serverFactors.join(' / ')}`,
      '',
      'A citizen picking "Athlete" must get the same number the engine would.',
      '',
    ].join('\n')).toEqual(serverFactors);
  });

  it('the engine holds no factor table of its own', () => {
    // fitness-engine.ts had one, derived from Ability. It came off in 50eaf55,
    // when computeBodyProgram started taking the Master Profile's activity
    // factor through shared/energy.ts. This test was written before that
    // commit precisely so it would fail the moment the removal landed and be
    // rewritten into this: fail if the table grows back.
    const fitness = readFileSync(join(api, 'fitness/fitness-engine.ts'), 'utf8');
    const grown = fitness.includes('function activityFactor(');
    expect(grown, 'fitness-engine.ts has grown its own activity factor table again').toBe(false);
  });
});
