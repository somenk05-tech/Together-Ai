import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A WORKOUT HAS A PLACE ───────────────────────────────────────────────────
 *
 * The owner, 17 Aug: "make this log user based, let user add details of workout
 * style home gym sports and the duration". Asked which set, he chose five —
 * home, gym, sports, studio, outdoor — and chose EDITING AND DELETING ENTRIES
 * as what "user based" meant. Before this, a mistyped 300-minute session was in
 * the week's total forever and the only way out was the database.
 *
 * What this file guards is the frontend half, and most of it is about the
 * difference between a thing that was not asked and a thing that was answered
 * "no" — which is the same rule the training profile's `equipment` earned an
 * hour before this page was written.
 */
describe('a workout has a place', () => {
  const page = code('features/fitness/pages/Log.tsx');
  const api = code('features/fitness/api.ts');

  it('offers the five the owner chose, and no sixth', () => {
    expect(api).toMatch(/export const WORKOUT_STYLES = \['home', 'gym', 'sports', 'studio', 'outdoor'\] as const;/);
    // The page never hardcodes its own list — one place to add a sixth.
    expect(page).toMatch(/WORKOUT_STYLES\.map/);
    expect(page).not.toMatch(/\['home', 'gym'/);
  });

  it('lets the question go unanswered, and says so by printing nothing', () => {
    // Pressing the chip you are already on clears it, so "I would rather not
    // say" stays reachable. And a row with no style prints NO badge — one that
    // said "Home" because nobody chose would be a row inventing a fact.
    expect(page).toMatch(/setStyle\(style === s \? null : s\)/);
    expect(page).toMatch(/\{e\.style && \(/);
    // The mutation omits the key entirely rather than sending null.
    expect(page).toMatch(/\.\.\.\(style \? \{ style \} : \{\}\)/);
  });

  it('gives every entry an edit and a remove, each with a name', () => {
    // Icon-sized controls repeated down a list are the classic place a screen
    // reader hears "button, button, button" — so each says which row it acts on.
    expect(page).toMatch(/aria-label=\{`Edit \$\{e\.focus\}`\}/);
    expect(page).toMatch(/aria-label=\{`Remove \$\{e\.focus\}`\}/);
    expect(page).toMatch(/useEditWorkout/);
    expect(page).toMatch(/useRemoveWorkout/);
  });

  it('asks once before removing, in place, without stopping the page', () => {
    // This list is the only record of what somebody actually did. A one-tap
    // delete is wrong — and a browser dialog is wrong too, because it blocks
    // everything else on the page while it waits.
    expect(page).toMatch(/const \[confirming, setConfirming\] = useState\(false\)/);
    expect(page).toMatch(/onClick=\{\(\) => setConfirming\(true\)\}/);
    expect(page).toMatch(/Keep<\/Button>/);
    expect(page).not.toMatch(/window\.confirm|confirm\(/);
  });

  it('edits in the row with the same controls the form has', () => {
    // A separate modal with a second set of controls is a second place for the
    // two to drift apart. Both use the one Chip.
    expect(page).toMatch(/function Chip\(/);
    const chipUses = [...page.matchAll(/<Chip\b/g)];
    expect({ atLeastFour: chipUses.length >= 4 }).toEqual({ atLeastFour: true });
    // Cancel puts back what was there — an edit abandoned halfway must not
    // leave the row's own state holding the half.
    expect(page).toMatch(/setFocus\(e\.focus\); setMinutes\(e\.minutes\); setIntensity\(e\.intensity\); setStyle\(e\.style\);/);
  });

  it('takes the recounted week from the server rather than doing its own sums', () => {
    // The week's minutes are the server's answer after every mutation, so the
    // total and the row that changed can never disagree. This page has never
    // computed a target and must not start.
    expect(api).toMatch(/mutationFn: fitnessApi\.editLog,\s*onSuccess: \(l\) => qc\.setQueryData\(\['fitness', 'log'\], l\)/);
    expect(api).toMatch(/mutationFn: fitnessApi\.removeLog,\s*onSuccess: \(l\) => qc\.setQueryData\(\['fitness', 'log'\], l\)/);
    expect(page).not.toMatch(/reduce\(/);
  });

  it('sends the edit to one entry by id, and the delete to one entry by id', () => {
    expect(api).toMatch(/api\.patch<FitnessLog>\(`\/fitness\/log\/\$\{id\}`, patch\)/);
    expect(api).toMatch(/api\.delete<FitnessLog>\(`\/fitness\/log\/\$\{id\}`\)/);
    // The id is stripped out of the body — a PATCH that carries its own id is a
    // PATCH that can be asked to move a row to another id.
    expect(api).toMatch(/\(\{ id, \.\.\.patch \}/);
  });
});
