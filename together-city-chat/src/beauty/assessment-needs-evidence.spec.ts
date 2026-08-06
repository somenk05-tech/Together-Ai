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
  it('returns the analysis only when an analysis was recorded', () => {
    // The bug verbatim was `analysis: safeJson(row.analysisJson, null)` — a
    // blob is not an event.
    expect(code).toMatch(/analysis:\s*row\.analyzedAt\s*\?\s*safeJson/);
    const bare = code.split('\n').filter((l) => /analysis:\s*safeJson<unknown>\(row\.analysisJson/.test(l));
    expect(bare).toEqual([]);
  });

  it('still returns null for an account that has never opened the hub', () => {
    // The first-open branch was already honest and must stay that way.
    expect(code).toMatch(/saved:\s*false[\s\S]{0,80}analysis:\s*null/);
  });

  it('does not generate an assessment from a profile save alone', () => {
    // Answering a questionnaire is not being looked at. Saving the profile
    // refreshes an assessment that already exists and creates none.
    expect(code).toMatch(/hasExisting\s*=\s*Boolean\(existing\?\.analysisJson\)/);
    expect(code).toMatch(/hasExisting\s*\n?\s*\?\s*assessBeauty\(/);
  });
});
