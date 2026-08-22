import { recommendProducts } from './beauty-engine';
import { planCategory, planWithinBudget, ownedRoles } from './budget-routine';
import { assessBeauty } from './beauty-analysis';

/**
 * ── WHAT THEY ALREADY HAVE IS AN ANNOTATION, NOT A DEDUCTION ────────────────
 *
 * The profile has asked "Current routine — what you use now" since it was
 * written. Twelve chips, stored in the same blob as everything else, and for a
 * long time NO READER — `p.routine` appeared in an interface and nowhere else.
 *
 * WHAT IT DID BETWEEN 16 AND 22 AUG, because the history is the point of this
 * file: it removed the role from the plan. A citizen who ticked Face Cleanser,
 * Moisturizer and Sunscreen stopped being handed all three again, which was
 * ₹1,785 a month on the shipped planner against roles they had just said were
 * covered.
 *
 * WHAT IT DOES NOW (owner, 22 Aug): "no matter what, the routine still shows
 * the best products for his skin." Every role is filled at the best match on
 * the shelf, owned or not, and the chip annotates the step instead of removing
 * it. THE ₹1,785 COMES BACK. That is the owner's call and it is recorded here
 * rather than lost, because the failure this file exists to prevent was never
 * "we sold them a cleanser" — it was "we asked and then behaved as though we
 * had not". The tests below are the difference: the chip must still reach the
 * routine, in words, over the product it chose.
 *
 * WHAT THE ANSWER STILL CANNOT SUPPORT, unchanged and the reason the sentence
 * is worded the way it is: it is a CATEGORY, not a product. "Face Cleanser"
 * does not say which one, so nothing here judges whether theirs suits them.
 * The routine says "this is the best match on the shelf, in case you want to
 * change" — an offer. It has never said "yours is fine" and it still does not.
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

  it('fills every role, including the ones they said they have', () => {
    // The inversion of what this test used to assert, and deliberately the
    // same three roles, so the diff on this line IS the decision.
    const before = plan([]);
    const after = plan(['Face Cleanser', 'Moisturizer', 'Sunscreen']);
    const roles = after.face.picks.map((x) => x.role);
    for (const role of ['Cleanse', 'Moisturise', 'Protect']) {
      expect({ role, filled: roles.includes(role) }).toEqual({ role, filled: true });
    }
    // And the plan costs the same as one built for somebody who ticked nothing:
    // the chips no longer move the money, which is the part that has a price.
    expect(after.face.picks.length).toBe(before.face.picks.length);
  });

  it('marks the picks it made on a role they own', () => {
    // Without this flag the reversal is silent — the routine has no way to
    // tell the citizen we read their answer, and an app that asks a question
    // and then acts as though it never did is worse than one that never asked.
    const after = plan(['Face Cleanser', 'Sunscreen']);
    const owned = after.face.picks.filter((x) => x.alreadyOwn);
    expect(owned.map((x) => x.role).sort()).toEqual(['Cleanse', 'Protect']);
    // Every OTHER pick is unmarked. A flag that is always on says nothing.
    for (const x of after.face.picks.filter((p) => !['Cleanse', 'Protect'].includes(p.role))) {
      expect({ role: x.role, marked: Boolean(x.alreadyOwn) }).toEqual({ role: x.role, marked: false });
    }
  });

  it('says out loud that it heard them, over the product it chose', () => {
    const after = plan(['Face Cleanser', 'Sunscreen']);
    expect(after.face.kept.map((k) => k.role).sort()).toEqual(['Cleanse', 'Protect']);
    for (const k of after.face.kept) {
      expect(k.why).toContain('already have');
      // Named as the thing it is. "You already use one protect step" is a role
      // doing a noun's job; people own a sunscreen.
      expect(k.why).toMatch(/a cleanser|a sunscreen/);
      // AND THE SENTENCE MUST NOT OUTLIVE THE BEHAVIOUR. It used to end "so we
      // haven't bought you another", which stopped being true on 22 Aug. A
      // stale sentence over a bought product is a lie the citizen can price.
      expect(k.why).not.toMatch(/haven't bought|not bought|instead/i);
      // What it says instead is an offer, and offers have a way out.
      expect(k.why).toMatch(/best match/i);
      expect(k.why).toMatch(/out of the bag/i);
    }
    // And it is not ALSO in leftOut — one role, one sentence.
    expect(after.face.leftOut.map((l) => l.role)).not.toContain('Cleanse');
  });

  it('costs what it costs, and the chips do not change the number', () => {
    /**
     * THE PRICE OF THE OWNER'S CALL, ASSERTED RATHER THAN IMPLIED.
     *
     * Between 16 and 22 Aug this test read "moves the freed money up the
     * routine, and never onto the owned step" — there was freed money, and the
     * band-first rule decided where it went. There is none now: a citizen who
     * owns three of the roles pays for three of the roles.
     *
     * It is asserted here, with a number, because a reversal nobody measures
     * is a reversal nobody can reconsider. If this ever comes back the other
     * way, this line is where the argument starts.
     */
    const before = plan([]);
    const after = plan(['Face Cleanser', 'Moisturizer', 'Sunscreen']);
    expect(after.face.spendInr).toBe(before.face.spendInr);
    expect(after.face.monthlyInr).toBe(before.face.monthlyInr);
    expect({ bandOrExplained: after.face.spendInr >= after.face.targetLowInr || after.face.leanReason !== null })
      .toEqual({ bandOrExplained: true });
  });

  it('works the same on hair, and leaves the other categories alone', () => {
    const after = plan(['Hair Shampoo', 'Hair Oil']);
    // Wash and Treat are filled like everything else, and both are marked.
    expect(after.hair.picks.filter((x) => x.alreadyOwn).map((x) => x.role).sort())
      .toEqual(['Treat', 'Wash']);
    expect(after.hair.kept.map((k) => k.role).sort()).toEqual(['Treat', 'Wash']);
    // Face was not asked about, so face carries no sentence at all.
    expect(after.face.picks.length).toBe(plan([]).face.picks.length);
    expect(after.face.kept).toEqual([]);
    expect(after.face.picks.every((x) => !x.alreadyOwn)).toBe(true);
  });

  it('asks for the same minimum whether or not they own anything', () => {
    /**
     * `minimumInr` is "what the essentials would cost". It used to fall for
     * somebody who owned two of the three, because two of the three were not
     * being bought. They are now, so it does not — and the honest reading of
     * that is the one this test pins: the chips have stopped affecting money
     * ANYWHERE, not just in the picks. A deduction that survived in one
     * derivation would be the worst of both, telling a citizen the essentials
     * cost less than the plan then charges them.
     */
    const owned = new Set(['Cleanse', 'Protect']);
    const short = planCategory(SHELF, 'face', 120, NEEDS, owned);
    const shortAlone = planCategory(SHELF, 'face', 120, NEEDS);
    expect(shortAlone.minimumInr).not.toBeNull();
    expect(short.minimumInr).toBe(shortAlone.minimumInr);
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
