import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const form = readFileSync(join(web, 'features', 'dating', 'pages', 'DatingProfile.tsx'), 'utf8');

/**
 * The height preference asks for a range, and admits that it hides people.
 *
 * L2: this was a free-text box ("e.g. 165–185cm", or "tallish", or nothing) that
 * no reader could act on, so it did nothing — one of the six preferences H3
 * found being collected and never used. Owner decision, 1 Aug: it becomes a
 * min/max range in centimetres and it is a HARD filter, like the age range
 * beside it, rather than a scoring nudge like the distance limit.
 *
 * WHICH MAKES THE COPY LOAD-BEARING. Two numeric ranges now sit in the same
 * card doing opposite things to a stranger's visibility — distance ranks people
 * lower, height removes them — and nothing about a number box tells you which
 * kind you are filling in. A citizen who thinks the range only nudges the order
 * is quietly shrinking their own pool. The behaviour is guarded in the API
 * (`dating/height-range.spec.ts`); what is guarded here is that the form still
 * says what the behaviour is.
 *
 * The other half is the promise that an unrecorded height is never excluded.
 * That is what makes a hard filter safe to ship over an optional field, and it
 * is exactly the kind of reassurance that gets edited out as clutter by someone
 * who does not know it is load-bearing.
 */
describe('the dating height preference', () => {
  it('asks for a range, not free text', () => {
    expect(form).toMatch(/prefHeightMinCm/);
    expect(form).toMatch(/prefHeightMaxCm/);
    expect(form).toMatch(/Height from \(cm\)/);
    expect(form).toMatch(/Height to \(cm\)/);
    // The old box is gone as an INPUT. `prefHeight` itself still appears — it
    // is read back to be offered for confirming — so this checks that nothing
    // writes to it from a text field any more.
    expect(form).not.toMatch(/placeholder="e\.g\. 165–185cm"/);
    expect(form).not.toMatch(/setD\(\{ prefHeight: e\.target\.value \}\)/);
  });

  it('no longer claims the preference is unused', () => {
    // True until this shipped, and now the opposite of true.
    expect(form).not.toMatch(/not used yet/);
    expect(form).not.toMatch(/doesn’t affect matching yet/);
  });

  it('says out loud that it hides people', () => {
    const HIDES = /<strong>hides<\/strong>\s*people outside it/;
    expect(form).toMatch(HIDES);
    // And distinguishes itself from the range that does not hide anybody,
    // because "hides" only means something next to the alternative.
    expect(form).toMatch(/Unlike distance/);
  });

  it('promises not to rule out a height it never collected', () => {
    expect(form).toMatch(/never hidden by this/);
    expect(form).toMatch(/won’t rule anybody out over a figure we\s*\n?\s*don’t have/);
  });

  it('offers the old free-text answer back instead of dropping it', () => {
    // The citizen's own words. Silently discarding them is a small theft; using
    // them as a filter without asking is a bigger one.
    expect(form).toMatch(/You previously wrote/);
    expect(form).toMatch(/Use \{legacyHeight\.parsed\[0\]\}–\{legacyHeight\.parsed\[1\]\} cm/);
    expect(form).toMatch(/Set the range above to start using it\./);
  });

  it('only guesses a range from two plausible centimetre figures', () => {
    // Mirrors the parser in the form: exactly two numbers, both human heights,
    // in order. Anything else falls through to asking.
    const guess = (raw: string): [number, number] | null => {
      const found = (raw.match(/\d{2,3}/g) ?? []).map(Number).filter((n) => n >= 100 && n <= 250);
      return found.length === 2 && found[0] <= found[1] ? [found[0], found[1]] : null;
    };
    expect(guess('165–185cm')).toEqual([165, 185]);
    expect(guess('165 to 185')).toEqual([165, 185]);
    expect(guess('185-165')).toBeNull();       // backwards: do not reorder somebody's answer
    expect(guess("5'6\"-6'0\"")).toBeNull();   // feet: not read, asked for instead
    expect(guess('tallish')).toBeNull();
    expect(guess('over 170')).toBeNull();      // one bound is ambiguous: which end?
    expect(guess('')).toBeNull();
  });
});
