import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ── A SAVE REFRESHED THE ONE LIST THE CITIZEN WAS NOT LOOKING AT ────────────
 *
 * `useUpsertDatingProfile` invalidated `['dating','matches']` and nothing else,
 * under a comment reading "refresh the match lists". Potential Matches is
 * `['dating','discover']`; the deck is `['dating','stack']`. So changing a
 * setting and going back to the room it governs showed the answer from before
 * the change, for as long as the query stayed fresh — which is exactly how it
 * was found: a filter widened, the same empty room.
 *
 * The three keys are one named list now, and this pins both halves: that the
 * name covers all three, and that the save actually spends it.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const api = read('./api.ts');

describe('a save refreshes what it changed', () => {
  it('names all three lists a settings change invalidates', () => {
    const m = api.match(/export const DATING_LIST_KEYS = \[([\s\S]*?)\] as const;/);
    expect(m).toBeTruthy();
    const names = [...(m as RegExpMatchArray)[1].matchAll(/'dating',\s*'([a-z]+)'/g)].map((x) => x[1]);
    expect(names.sort()).toEqual(['discover', 'matches', 'stack']);
  });

  it('spends that list on a successful profile save', () => {
    const fn = api.slice(api.indexOf('export function useUpsertDatingProfile'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/for \(const queryKey of DATING_LIST_KEYS\) void qc\.invalidateQueries\(\{ queryKey \}\)/);
    // The one it used to do alone must not be the only one left behind.
    expect(body).not.toMatch(/invalidateQueries\(\{ queryKey: \['dating', 'matches'\] \}\)/);
  });

  it('still hands the saved profile straight back, so the form does not flicker', () => {
    const fn = api.slice(api.indexOf('export function useUpsertDatingProfile'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/setQueryData\(\['dating', 'profile'\], profile\)/);
  });
});
