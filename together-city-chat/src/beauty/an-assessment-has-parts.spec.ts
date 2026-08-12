import { assessBeauty, focusOf, noteOf, FOCUS_LIMIT } from './beauty-analysis';

/**
 * THE SUMMARY IS ONE SENTENCE AND TWO HALVES, AND BOTH HAVE TO BE TRUE.
 *
 * The profile page stopped printing the assessment and started SETTING it — the
 * priorities in display type, the qualifier in italic beneath them. That needs
 * the sentence in parts, and there were two wrong ways to get them.
 *
 * Splitting the paragraph in the browser puts the rule that composed it in two
 * places, and the second copy is always the one nobody updates. Storing the
 * parts and leaving the paragraph to drift is the same bug with the halves
 * swapped. So the paragraph is COMPOSED FROM the parts, in this file, and this
 * spec asserts the join rather than trusting it.
 *
 * The third thing it guards is the one that would have shipped silently: an
 * assessment saved before these fields existed still has to answer. There is no
 * migration — the parts are derived on read from what such a row already
 * carries — and `focusOf`/`noteOf` are that derivation, tested here against the
 * shape an old row actually has.
 */

/**
 * THE FIXTURE IS THE OWNER'S OWN ASSESSMENT, and it took two goes to write.
 *
 * A reading reaches `attention` on TWO independent signals, not one, and the
 * field is `skinConcerns` rather than `concerns` — a plausible-looking profile
 * with one concern each and the wrong key name ranks `monitor` throughout,
 * produces an empty focus, and quietly tests the well-balanced branch in every
 * assertion below while appearing to test the other one. That is the failure
 * mode a fixture has: it does not throw, it just stops asking the question.
 *
 * This one reproduces the summary on the live profile page word for word —
 * "Pigmentation & spots, Fine lines & firmness, Oil balance" — and it has a
 * FOURTH attention reading (Scalp health) so the cut at three is exercised
 * rather than assumed.
 */
const profile = {
  age: 44,
  gender: 'male',
  skinType: 'oily',
  skinConcerns: ['dark spots', 'sun damage', 'fine lines'],
  hairConcerns: ['hair fall', 'dandruff', 'thinning'],
  scalpType: 'oily',
  hairType: 'wavy',
  allergies: ['fragrance'],
};

describe('an assessment has parts, not just a paragraph', () => {
  it('rebuilds the paragraph exactly out of the two halves', () => {
    // THE JOIN, ASSERTED. If either half is ever edited without the other, or
    // the separator changes, this is what says so — and it is the only thing
    // that can, because both halves look correct on their own.
    const a = assessBeauty(profile);
    expect(a.summary.startsWith('Your assessment flags ') || a.summary.startsWith('Your skin and hair')).toBe(true);
    expect(a.summary.endsWith(a.note)).toBe(true);
    expect(a.summary).toBe(`${a.summary.slice(0, a.summary.length - a.note.length - 1)} ${a.note}`);
  });

  it('names the findings the sentence names, in the sentence\'s own order', () => {
    const a = assessBeauty(profile);
    expect(a.focus.length).toBeGreaterThan(0);
    for (const f of a.focus) expect(a.summary).toContain(f);
    expect(a.summary).toContain(a.focus.join(', '));
  });

  it('summarises rather than lists — three findings, however many were found', () => {
    // A citizen with seven readings on attention does not need seven in the
    // opening sentence; they need the order to start in. All of them are one
    // section down, unabridged.
    const a = assessBeauty(profile);
    expect(a.focus.length).toBe(FOCUS_LIMIT);
    const found = [...a.skin.issues, ...a.hair.issues];
    // More were found than are named, or this assertion is testing nothing.
    expect(found.length).toBeGreaterThan(FOCUS_LIMIT);
    expect(a.focus).toEqual(found.slice(0, FOCUS_LIMIT));
  });

  it('says the sensitivities half only when there are sensitivities', () => {
    const withAllergy = assessBeauty(profile);
    const without = assessBeauty({ ...profile, allergies: [] });
    expect(withAllergy.note).toContain('and sensitivities');
    expect(without.note).not.toContain('and sensitivities');
    // And the paragraph still agrees with its own half in both cases.
    expect(without.summary.endsWith(without.note)).toBe(true);
  });

  it('has a qualifier even when there is nothing to work on', () => {
    // The well-balanced branch is a different sentence, not a missing one — a
    // plate with an empty italic line under it reads as a rendering failure,
    // which is exactly why the page falls back to the paragraph here instead.
    const calm = assessBeauty({ age: 26, skinType: 'normal', skinConcerns: [], allergies: [] });
    expect(calm.focus).toEqual([]);
    expect(calm.note.length).toBeGreaterThan(0);
    expect(calm.summary.endsWith(calm.note)).toBe(true);
    expect(calm.summary).not.toContain('as the priorities');
  });

  /**
   * ── AND AN ASSESSMENT SAVED BEFORE ANY OF THIS ─────────────────────────────
   *
   * There is no migration and there should not be one: nothing about the stored
   * answer changed, only what the page does with it. These two functions are
   * how a March row answers a question invented in August, and they are given
   * the shape a March row actually has.
   */
  it('derives the findings of an assessment stored without them', () => {
    const old = { skin: { issues: ['Pigmentation & spots', 'Oil balance'] }, hair: { issues: ['Scalp'] } };
    expect(focusOf(old)).toEqual(['Pigmentation & spots', 'Oil balance', 'Scalp']);
    // Skin first, then hair, then cut — the sentence's own order, so a derived
    // focus reads the same way the stored summary does.
    expect(focusOf({ skin: { issues: ['a', 'b', 'c'] }, hair: { issues: ['d'] } })).toEqual(['a', 'b', 'c']);
  });

  it('derives the qualifier by the join this file makes, not by parsing prose', () => {
    expect(noteOf('Your assessment flags A, B as the priorities. The routine below targets these.'))
      .toBe('The routine below targets these.');
    // A findings list can contain full stops in a brand or a unit; only the
    // FIRST full-stop-space is the join, and that is the one this splits on.
    expect(noteOf('One. Two. Three.')).toBe('Two. Three.');
  });

  it('answers empty rather than a fragment when there is no second sentence', () => {
    // The card shows no qualifier at all in that case. Half a sentence in
    // italic under a display line is worse than nothing under it.
    expect(noteOf('A single sentence with no join')).toBe('');
    expect(noteOf('')).toBe('');
    expect(focusOf(null)).toEqual([]);
    expect(focusOf({})).toEqual([]);
  });

  it('derives from a real assessment exactly what that assessment stored', () => {
    // The two paths agreeing is the whole claim: a fresh row and an old row
    // produce the same card.
    const a = assessBeauty(profile);
    expect(focusOf(a)).toEqual(a.focus);
    expect(noteOf(a.summary)).toBe(a.note);
  });
});
