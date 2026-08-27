import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const form = readFileSync(join(web, 'features', 'dating', 'pages', 'DatingProfile.tsx'), 'utf8');
/** Absence checks read the CODE, not the comments that explain what was
 *  removed — a guard that reads its own documentation never goes green. */
const code = form.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

/**
 * The preferred-height section is gone from the form. The filter is not.
 *
 * L2, 1 Aug: the free-text height box became a min/max range and, by owner
 * decision, a HARD filter — it hides people, the way the age range does.
 * F.33 then priced it: a typical range (165–185cm) removes about 34.6% of the
 * city for the viewer who typed it, and neither side is ever told.
 *
 * OWNER DECISION, 2 Aug: take the section off the form. Asked whether the
 * filter should come off with it, the answer was no — stored ranges keep
 * filtering.
 *
 * So this file guards a deliberately uncomfortable shape, and says so out loud
 * rather than letting it read as an oversight:
 *
 * · Nothing collects a height range any more. No input, no legacy offer.
 * · A range somebody already saved is still read by `hardFilterReason` in the
 *   API, so they are still filtered by it — with no screen left to see it on,
 *   and no way to remove it. The person hidden is not told either.
 * · Therefore a save MUST round-trip the stored keys. If it dropped them the
 *   filter would switch itself off for anybody who edits their profile and stay
 *   on for everybody who does not: one setting behaving two ways.
 *
 * The API half is guarded in `dating/height-range.spec.ts`. What is guarded
 * here is that the form no longer asks, and no longer destroys what it asked
 * for before.
 */
describe('the dating height preference', () => {
  it('is no longer collected', () => {
    expect(code).not.toMatch(/Height from \(cm\)/);
    expect(code).not.toMatch(/Height to \(cm\)/);
    expect(code).not.toMatch(/setD\(\{ prefHeightMinCm/);
    expect(code).not.toMatch(/setD\(\{ prefHeightMaxCm/);
    // Nor as free text, which is where L2 started.
    expect(code).not.toMatch(/setD\(\{ prefHeight: e\.target\.value \}\)/);
  });

  it('no longer offers the old free-text answer back, because there is nothing to confirm it into', () => {
    expect(code).not.toMatch(/You previously wrote/);
    expect(code).not.toMatch(/legacyHeight/);
  });

  it('does not clear a range somebody already saved', () => {
    // The stored value is live: it still hides people. A save writes the whole
    // parsed extras object back, so the keys survive an edit.
    expect(form).toMatch(/const extras: DX = \{ \.\.\.dx \};/);
    expect(form).toMatch(/prefHeight\?: string; prefHeightMinCm\?: number \| null; prefHeightMaxCm\?: number \| null;/);
    expect(code).not.toMatch(/prefHeightMinCm: null/);
    expect(code).not.toMatch(/prefHeightMaxCm: undefined/);
  });

  it('writes the one-way door down where the fields are declared', () => {
    // Not decoration. This is the only place a future reader learns that a
    // stored range still hides people and cannot be reached.
    expect(form).toMatch(/ONE-WAY DOOR/);
    expect(form).toMatch(/NO LONGER COLLECTED/);
  });

  it('leaves the distance preference alone — it never hid anybody', () => {
    // The neighbour in the same card, and the reason "hides" meant anything:
    // distance ranks people lower, it does not remove them. The control is a
    // slider now (label reads "Distance — N km"), but the promise is the same.
    expect(form).toMatch(/Distance \u2014 \{distanceKm/);
    expect(form).toMatch(/type="range"/);
    expect(form).toMatch(/scored lower/);
  });
});
