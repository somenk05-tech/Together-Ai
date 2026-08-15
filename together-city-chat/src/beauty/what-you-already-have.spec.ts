import { recommendProducts } from './beauty-engine';
import { planCategory, planWithinBudget, ownedRoles } from './budget-routine';
import { assessBeauty } from './beauty-analysis';

/**
 * ── THE CHEAPEST PRODUCT IS THE ONE THEY ALREADY OWN ────────────────────────
 *
 * The profile has asked "Current routine — what you use now" since it was
 * written. Twelve chips, stored in the same blob as everything else, and NO
 * READER — `p.routine` appeared in an interface and nowhere else in the hub.
 *
 * Measured on the shipped planner before this: a citizen who ticked Face
 * Cleanser, Moisturizer and Sunscreen was handed a cleanser, a moisturiser and
 * a sunscreen. ₹1,785 a month against three roles they had just said were
 * covered — and the form that asked them was still on the screen.
 *
 * WHAT THE ANSWER CAN AND CANNOT SUPPORT. It is a CATEGORY, not a product.
 * "Face Cleanser" does not say which one, so nothing here judges whether theirs
 * suits them; a routine that said "your cleanser is fine" on this evidence
 * would be inventing the half of the sentence that matters. It says only that
 * we have not bought another, and it does not move the money somewhere else —
 * which is the same rule as the budget itself, applied to a smaller number.
 */

const OILY = assessBeauty({
  skinType: 'oily', skinConcerns: ['Acne'], skinGoals: ['Oil Control'],
  hairConcerns: ['Hair Fall'], age: 26,
});
const READINGS = [...OILY.skin.readings, ...OILY.hair.readings];
const NEEDS = new Set(READINGS.filter((r) => r.level !== 'good').map((r) => r.key));
const SHELF = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'oily' }, insights: [] });

const plan = (own: string[]) => planWithinBudget(SHELF, { face: 5000, hair: 3000, body: 0 }, NEEDS, own);

describe('what the citizen already has', () => {
  it('maps the chips the profile actually offers', () => {
    // The vocabulary is the twelve chips in Profile.tsx, verbatim. A rename on
    // that page has to fail here rather than silently stop matching.
    expect(ownedRoles('face', ['Face Cleanser', 'Moisturizer', 'Sunscreen', 'Serum', 'Toner', 'Face Mask']))
      .toEqual(new Set(['Cleanse', 'Moisturise', 'Protect', 'Treat', 'Prep', 'Weekly']));
    expect(ownedRoles('hair', ['Hair Shampoo', 'Conditioner', 'Hair Oil', 'Hair Serum']))
      .toEqual(new Set(['Wash', 'Condition', 'Treat', 'Finish']));
    // A weekly mask and a pre-wash oil are the same step covered twice over.
    expect(ownedRoles('hair', ['Hair Mask'])).toEqual(new Set(['Treat']));
    // EXFOLIATOR IS DELIBERATELY UNMAPPED. There is no exfoliating role in this
    // planner, and quietly reading it as the weekly mask would tell somebody
    // their mask step is covered because they own an acid.
    expect(ownedRoles('face', ['Exfoliator'])).toEqual(new Set());
    expect(ownedRoles('face', ['', 'Something Else'])).toEqual(new Set());
  });

  it('does not sell somebody a second one of what they have', () => {
    const before = plan([]);
    const after = plan(['Face Cleanser', 'Moisturizer', 'Sunscreen']);
    const roles = after.face.picks.map((x) => x.role);
    for (const gone of ['Cleanse', 'Moisturise', 'Protect']) expect(roles).not.toContain(gone);
    expect(after.face.monthlyInr).toBeLessThan(before.face.monthlyInr);
  });

  it('names the step it kept rather than quietly shipping a shorter list', () => {
    // A step that simply vanishes is indistinguishable from one we forgot. The
    // sentence is the difference between an answer and an omission.
    const after = plan(['Face Cleanser', 'Sunscreen']);
    expect(after.face.kept.map((k) => k.role).sort()).toEqual(['Cleanse', 'Protect']);
    for (const k of after.face.kept) {
      expect(k.why).toContain('already have');
      // Named as the thing it is. "You already use one protect step" is a role
      // doing a noun's job; people own a sunscreen.
      expect(k.why).toMatch(/a cleanser|a sunscreen/);
    }
    // And it is not ALSO in leftOut — one role, one sentence.
    expect(after.face.leftOut.map((l) => l.role)).not.toContain('Cleanse');
  });

  it('moves the freed money up the routine, and never onto the owned step', () => {
    /**
     * REVERSED, 16 AUG, WITH THE BAND. This test held every surviving pick
     * constant and required the saving to reach the citizen — but utilisation
     * is measured against the number they set, owned steps or not, so the
     * freed cash now climbs the rest of the routine toward the band instead
     * of resting. What did NOT reverse, and what this still catches: the
     * owned step itself is never re-bought at any budget, and the plan either
     * lands its band or says why the guarded shelf could not.
     */
    const after = plan(['Face Cleanser', 'Moisturizer', 'Sunscreen']);
    const roles = after.face.picks.map((x) => x.role);
    for (const gone of ['Cleanse', 'Moisturise', 'Protect']) {
      expect({ role: gone, rebought: roles.includes(gone) }).toEqual({ role: gone, rebought: false });
    }
    expect({ bandOrExplained: after.face.spendInr >= after.face.targetLowInr || after.face.leanReason !== null })
      .toEqual({ bandOrExplained: true });
  });

  it('works the same on hair, and leaves the other categories alone', () => {
    const after = plan(['Hair Shampoo', 'Hair Oil']);
    expect(after.hair.picks.map((x) => x.role).sort()).toEqual(['Condition', 'Finish']);
    expect(after.hair.kept.map((k) => k.role).sort()).toEqual(['Treat', 'Wash']);
    // Face was not asked about, so face is untouched.
    expect(after.face.picks.length).toBe(plan([]).face.picks.length);
    expect(after.face.kept).toEqual([]);
  });

  it('stops asking for a minimum it no longer needs', () => {
    /**
     * `minimumInr` is "what the essentials would cost". Somebody who already
     * owns two of the three essentials does not need the third one's budget to
     * cover all three, and telling them otherwise is the same untruth as
     * selling them the two again.
     */
    const owned = new Set(['Cleanse', 'Protect']);
    const short = planCategory(SHELF, 'face', 120, NEEDS, owned);
    const shortAlone = planCategory(SHELF, 'face', 120, NEEDS);
    expect(shortAlone.minimumInr).not.toBeNull();
    expect(short.minimumInr === null || short.minimumInr! < shortAlone.minimumInr!).toBe(true);
  });

  it('says nothing when they were never asked', () => {
    // An empty answer is not "they own nothing"; it is a question they have not
    // reached. Same plan as before the field existed, and no sentence about it.
    for (const answer of [[], undefined as unknown as string[]]) {
      const p = planWithinBudget(SHELF, { face: 5000, hair: 3000, body: 0 }, NEEDS, answer);
      expect(p.face.kept).toEqual([]);
      expect(p.face.picks.length).toBeGreaterThan(0);
    }
  });
});
