import * as fs from 'fs';
import * as path from 'path';
import { cardNotes, factorScores, frictions, mismatchFactor, type DXProfile } from './matching';

/**
 * ── A CARD THAT ARGUES WITH ITS OWN HEADLINE ────────────────────────────────
 *
 * Before 1 Sep a fundamentally wrong match could not reach a card: intent,
 * children and diet removed the person. Two things were built on that and both
 * broke the moment it stopped being true.
 *
 *   `explain` returns up to FIVE positives whatever the score. At 18% that is
 *   five reasons to like somebody over a number saying not to.
 *
 *   `frictions` caps at TWO, and its own comment says why: "a card with five is
 *   an argument against the match, and if the match were that bad the filters
 *   should have removed it." Nothing removes it now.
 *
 * And four of the seven reasons a score can fall — diet, religion, distance,
 * the two habits — had no sentence at all, because they used to be removals.
 */
const dx = (p: Partial<DXProfile> = {}): DXProfile => ({ ...p });
const INTERESTS = ['Films', 'Travel', 'Food', 'Music', 'Books'];
const same = {
  city: 'Mumbai', state: 'Maharashtra', country: 'India',
  values: ['Family', 'Honesty', 'Growth'], personalityTraits: ['Calm', 'Curious'],
  smoking: 'Never', drinking: 'Never',
};
const notes = (a: DXProfile, b: DXProfile) =>
  cardNotes(factorScores(92, INTERESTS, INTERESTS, a, b), a, b, ['Films', 'Travel'], [], null);

describe('a card that was scored down says so', () => {
  const A = dx({ ...same, relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian', diet: 'Vegetarian' });
  const B = dx({ ...same, relationshipGoal: 'Casual Dating', wantsChildren: 'No', diet: 'Non-vegetarian' });

  it('names more than two frictions when more than two things are wrong', () => {
    expect(mismatchFactor(A, B)).toBeLessThan(1);
    const f = notes(A, B).frictions;
    expect(f.length).toBeGreaterThan(2);
    expect(f.join(' ')).toContain('Casual Dating');
    expect(f.join(' ')).toContain('children');
    expect(f.join(' ')).toContain('Vegetarian');
  });

  it('stops leading with five compliments', () => {
    expect(notes(A, B).reasons.length).toBeLessThanOrEqual(2);
  });

  it('leaves a clean card exactly as it was — five reasons, two frictions', () => {
    const C = dx({ ...same, relationshipGoal: 'Marriage', wantsChildren: 'Yes', diet: 'Vegetarian' });
    expect(mismatchFactor(A, C)).toBe(1);
    const n = notes(A, C);
    expect(n.reasons.length).toBeGreaterThan(2);
    expect(n.frictions.length).toBeLessThanOrEqual(2);
  });
});

describe('the four that used to be removals now have sentences', () => {
  const base = { ...same, relationshipGoal: 'Marriage', diet: 'Vegetarian' };
  const f = (a: DXProfile, b: DXProfile) => frictions(factorScores(92, INTERESTS, INTERESTS, a, b), a, b);

  it('says which diet was asked for and which was given', () => {
    const a = dx({ ...base, prefDiet: 'Vegetarian' });
    const b = dx({ ...base, diet: 'Non-vegetarian' });
    expect(f(a, b).join(' ')).toContain('You asked for Vegetarian; they said Non-vegetarian.');
  });

  it('names a habit the viewer asked not to be matched with', () => {
    const a = dx({ ...base, dealBreakers: ['Smoking'] });
    const b = dx({ ...base, smoking: 'Regularly' });
    expect(f(a, b).join(' ')).toContain('They smoke regularly');
  });

  /**
   * RELIGION IS NOT QUOTED, and this is the assertion that matters most here.
   * `matchDetail` shows goal, diet, smoking, drinking, height and education —
   * religion appears on no card anywhere. Printing a stranger's religion as the
   * explanation for a low number would put it in front of every viewer at every
   * score, which is the exact defect the children friction was fixed for.
   */
  it('never prints the other person\'s religion', () => {
    const a = dx({ ...base, religion: 'Hindu', dealBreakers: ['Religion'] });
    const b = dx({ ...base, religion: 'Christian' });
    const line = f(a, b).join(' ');
    expect(line).toContain('Different answers on religion — you said Hindu.');
    expect(line).not.toContain('Christian');
  });

  it('says nothing about a chip the citizen unticked', () => {
    const a = dx({ ...base, prefDiet: 'Vegetarian', dealBreakers: ['-Diet'] });
    const b = dx({ ...base, diet: 'Non-vegetarian' });
    expect(f(a, b).join(' ')).not.toContain('You asked for');
  });
});

/** The pin: one call, both halves, at all three places that build a card. */
describe('every card is built the same way', () => {
  const service = fs.readFileSync(path.join(__dirname, 'dating.service.ts'), 'utf8');

  it('uses cardNotes at every site and computes neither half alone', () => {
    expect((service.match(/\.\.\.cardNotes\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(service).not.toMatch(/reasons: explain\(/);
    expect(service).not.toMatch(/frictions: frictions\(/);
  });
});
