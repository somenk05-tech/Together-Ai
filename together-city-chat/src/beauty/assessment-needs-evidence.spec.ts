import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AN ASSESSMENT NEEDS SOMETHING TO HAVE ASSESSED.
 *
 * Seven readings, every one of them GOOD, on an account that had uploaded no
 * photographs: "No active acne reported", "Even tone", "Firm, few lines".
 * Those are not findings about a face. They are the ABSENCE of a complaint in
 * an unanswered questionnaire, printed as if somebody had looked — which is
 * precisely the rule this codebase keeps: no screen asserts an absence it
 * never established.
 *
 * `analyzedAt` is the record that an analysis actually happened. A stored
 * analysisJson without one is a leftover — from an older code path, from a
 * deleted photo set — and a leftover is not evidence.
 */
const src = readFileSync(join(__dirname, 'beauty.service.ts'), 'utf8');
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = stripComments(src);

describe('the readings appear only when something was read', () => {
  it('returns the analysis only when an analysis was recorded AND its photos are on file', () => {
    // Two bugs, one door. First: `analysis: safeJson(row.analysisJson, null)`
    // — a blob is not an event. Second, found on the owner's own account: a
    // row stamped analyzedAt by the RETIRED profile-save path, with zero
    // photos, kept printing seven GOOD readings — a timestamp is not
    // evidence either. The gate demands both.
    expect(code).toMatch(/analysis:\s*row\.analyzedAt\s*&&\s*photosOnFile\.length\s*>\s*0\s*\?\s*safeJson/);
    const bare = code.split('\n').filter((l) => /analysis:\s*safeJson<unknown>\(row\.analysisJson/.test(l));
    expect(bare).toEqual([]);
    // and the timestamp the screen prints obeys the same gate — "saved 22
    // Jul" under an empty assessment is the same lie in a smaller font
    expect(code).toMatch(/analyzedAt:\s*row\.analyzedAt\s*&&\s*photosOnFile\.length\s*>\s*0/);
  });

  it('still returns null for an account that has never opened the hub', () => {
    // The first-open branch was already honest and must stay that way.
    expect(code).toMatch(/saved:\s*false[\s\S]{0,80}analysis:\s*null/);
  });

  it('does not generate an assessment from a profile save alone — and does not REFRESH an unevidenced one', () => {
    // Answering a questionnaire is not being looked at. Saving the profile
    // refreshes an assessment only when that assessment is still evidenced
    // (event + photos); refreshing a stale pre-evidence row kept the
    // fabrication alive on every save, which is how a fixed bug stayed on
    // production for three weeks.
    expect(code).toMatch(/hasExisting\s*=\s*Boolean\(existing\?\.analysisJson\)\s*&&\s*Boolean\(existing\?\.analyzedAt\)\s*&&\s*photos\.length\s*>\s*0/);
    expect(code).toMatch(/hasExisting\s*\n?\s*\?\s*assessBeauty\(/);
  });
});
