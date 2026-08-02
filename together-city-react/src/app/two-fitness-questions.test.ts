import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const dating = read('features', 'dating', 'pages', 'DatingProfile.tsx');
const fitness = read('features', 'fitness', 'pages', 'Profile.tsx');

/**
 * Two forms, two questions, and the words that make them look like one.
 *
 * Dating asks how somebody would describe themselves. Fitness asks what they
 * can be asked to do — and that answer sets training days and an intensity
 * ceiling. The dating form used to call its field "Fitness level", which is
 * the fitness form's question, in the fitness form's words, on a page that
 * does not set a workout plan.
 */
describe('the two fitness questions', () => {
  it('does not ask dating for a fitness level', () => {
    expect(dating).not.toMatch(/>Fitness level</);
    expect(dating).toMatch(/>How active you are</);
  });

  it('tells the citizen the dating answer sets nothing', () => {
    // The failure this avoids is not confusion, it is consent: somebody
    // describing themselves for strangers has not agreed to be trained or fed
    // on the strength of it.
    expect(dating).toMatch(/does not set your workout plan/i);
  });

  it('keeps the ability tier calling itself an ability', () => {
    expect(fitness).toMatch(/'Ability'/);
  });

  it('keeps each page reading only its own field', () => {
    expect(dating).not.toMatch(/fitnessProfile|useFitnessProfile/);
    expect(fitness).not.toMatch(/fitnessLevel/);
  });
});
