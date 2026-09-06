import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE PLAN FOLLOWS THE PROFILE — owner, 6 Sep: "updating profile does not
 * update the workout plan for the user."
 *
 * Saving the training profile invalidated the week and nothing else, and the
 * city's queries stay fresh for thirty seconds. So: save Advanced + Weight
 * training + Strength, walk to Workout inside that window, and today's
 * session — built on the server from the very profile just saved, and from
 * the week the save re-cut — came back out of the cache exactly as it was.
 * The fix is one predicate: everything under ['fitness'] that is built from
 * the profile is stale the moment the profile changes. The profile itself is
 * written, not refetched, because the server just returned it.
 */

const SRC = join(__dirname, '..');
const api = readFileSync(join(SRC, 'features/fitness/api.ts'), 'utf8');
const client = readFileSync(join(SRC, 'api/queryClient.ts'), 'utf8');

describe('saving the training profile', () => {
  const hook = api.slice(api.indexOf('export function useSaveFitnessProfile'), api.indexOf('export function useFitnessPlan'));

  it('makes every fitness query built from it stale, and keeps the profile it was handed', () => {
    expect(hook).toMatch(/qc\.setQueryData\(\['fitness', 'profile'\], p\)/);
    expect(hook).toMatch(/invalidateQueries\(\{ queryKey: \['fitness'\], predicate: \(q\) => q\.queryKey\[1\] !== 'profile' \}\)/);
    // The narrow invalidation this replaces — the week alone — is gone.
    expect(hook).not.toMatch(/queryKey: \['fitness', 'plan'\]/);
  });

  it('matters because queries are fresh for half a minute', () => {
    // The reason a navigation did not save the day: a fresh query is served
    // from the cache on mount. Should this ever drop to 0 the predicate is
    // still right, only no longer load-bearing.
    expect(client).toMatch(/staleTime: 30_000/);
  });

  it('is the one place the training profile and the body goal are saved from', () => {
    const page = readFileSync(join(SRC, 'features/fitness/pages/Profile.tsx'), 'utf8');
    expect(page).toMatch(/useSaveFitnessProfile\(\)/);
    expect(page).toMatch(/save\.mutate\(\{ age, sex, level, mode, goal, conditions, heightCm: num\(heightCm\), weightKg: num\(weightKg\), bodyGoal,/);
  });
});

describe('logging a workout', () => {
  it('re-cuts today\'s session, which reads the log', () => {
    // "You have not logged a session in the last week, so this starts where
    // it is comfortable to start" is a sentence the session writes from the
    // log; an entry added, changed or removed changes it.
    for (const name of ['useAddWorkout', 'useEditWorkout', 'useRemoveWorkout']) {
      const from = api.indexOf(`export function ${name}`);
      const hook = api.slice(from, api.indexOf('\n}\n', from));
      expect({ name, invalidates: /invalidateQueries\(\{ queryKey: \['fitness', 'session'\] \}\)/.test(hook) }).toEqual({ name, invalidates: true });
    }
  });
});
