import * as allergyNotice from './allergy-notice';
import { matchesFor, type RecordedAllergy } from './allergy-notice';

const rec =(id: string, title: string, detail: string | null = null): RecordedAllergy =>
  ({ id, title, detail, recordedOn: '2026-07-01T00:00:00.000Z' });

describe('a recorded allergy next to a prescribed medicine', () => {
  it('matches the case the placeholder text itself suggests', () => {
    // Medical → Records literally prompts "Penicillin allergy".
    const m = matchesFor('Penicillin V 250mg', [rec('a1', 'Penicillin allergy')]);
    expect(m).toHaveLength(1);
    expect(m[0].matchedOn).toBe('penicillin');
    expect(m[0].foundIn).toBe('title');
  });

  it('matches from the other end too — the medicine named in their record', () => {
    const m = matchesFor('Ibuprofen 400mg', [rec('a1', 'Reaction to ibuprofen')]);
    expect(m[0]?.matchedOn).toBe('ibuprofen');
  });

  it('reads the free-text detail, because that is where people write it', () => {
    const m = matchesFor('Amoxicillin 500mg', [rec('a1', 'Antibiotics', 'Rash from amoxicillin in 2019')]);
    expect(m[0]?.foundIn).toBe('detail');
    expect(m[0]?.matchedOn).toBe('amoxicillin');
  });

  it('names what it matched, so the flag can be argued with', () => {
    const m = matchesFor('Aspirin 75mg', [rec('a1', 'Aspirin allergy')]);
    expect(m[0]).toMatchObject({ allergyId: 'a1', title: 'Aspirin allergy', matchedOn: 'aspirin' });
  });
});

describe('and does not cry wolf', () => {
  it('ignores dosage forms, units and instructions', () => {
    // One useless flag teaches somebody to ignore the useful one.
    const allergies = [rec('a1', 'Adhesive tablet dressing'), rec('a2', 'Cream base reaction')];
    expect(matchesFor('Ibuprofen tablet', allergies)).toEqual([]);
    expect(matchesFor('Hydrocortisone cream', allergies)).toEqual([]);
  });

  it('matches whole words, never substrings', () => {
    // The mistake this repo has made five times. "cillin" is not a match.
    expect(matchesFor('Penicillin', [rec('a1', 'cillin')])).toEqual([]);
    expect(matchesFor('Metformin', [rec('a1', 'formin')])).toEqual([]);
  });

  it('returns nothing when nothing was recorded', () => {
    expect(matchesFor('Penicillin V', [])).toEqual([]);
  });

  it('handles an empty or blank medicine name without throwing', () => {
    expect(matchesFor('', [rec('a1', 'Penicillin allergy')])).toEqual([]);
    expect(matchesFor('   ', [rec('a1', 'Penicillin allergy')])).toEqual([]);
  });
});

describe('what it deliberately cannot do', () => {
  it('does NOT know amoxicillin is a penicillin — and that is the point', () => {
    // Drug-class membership is clinical knowledge with no source in this repo.
    // This assertion exists so that anybody who "fixes" it by writing a class
    // table from memory has to delete a test that explains why not.
    expect(matchesFor('Amoxicillin 500mg', [rec('a1', 'Penicillin allergy')])).toEqual([]);
  });

  it('exposes no boolean that could be read as a clearance', () => {
    // An empty list means "nothing matched", never "this is safe". There is no
    // isSafe() here on purpose; RELEASE-GATE.md already carried one tautological
    // safety gate and it cost more than it was worth.
    const names = Object.keys(allergyNotice);
    expect(names.filter((n) => /safe|clear|conflict|interaction/i.test(n))).toEqual([]);
    expect(names).toEqual(['matchesFor']);
  });
});
