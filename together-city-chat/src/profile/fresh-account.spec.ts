import { answeredNow } from '../shared/prisma/answered-at';
import { computeTargets, REFERENCE_BODY } from '../nutrition/nutrition.service';

/**
 * QA-3.1, in the form that can run without a browser: a brand-new account must
 * not describe a person who does not exist.
 *
 * The review's p1 is a screenshot of "Your data across Together City" on an
 * account that had answered nothing, reading:
 *
 *     NUTRITION  Diet: everything · Goal: maintain
 *     BEAUTY     Skin: normal · Hair: straight
 *     FITNESS    beginner · goal: general
 *
 * Every one of those came from a column default, written by registration before
 * the citizen had been asked anything. The full walkthrough the spec describes
 * still wants automating against a real browser; these are the two rules
 * underneath it, pinned where they are cheap to check.
 */

describe('a new account answers nothing on the citizen\'s behalf', () => {
  describe('answeredNow', () => {
    it('marks a payload as a real answer', () => {
      const at = new Date('2026-07-30T12:00:00Z');
      expect(answeredNow({ diet: 'jain' }, at)).toEqual({ diet: 'jain', answeredAt: at });
    });

    it('keeps the original fields untouched', () => {
      const data = { diet: 'vegan', goal: 'lose', heightCm: 170 };
      expect(answeredNow(data)).toMatchObject(data);
    });

    it('does not mutate its input', () => {
      // The payloads it receives are reused — dto objects, fan-out plans.
      const data = { diet: 'vegan' };
      answeredNow(data);
      expect(data).toEqual({ diet: 'vegan' });
    });
  });

  describe('daily targets say when they are not about you', () => {
    // The most consequential invented data in the app. Mifflin-St Jeor cannot
    // run on nulls, so an unknown body falls back to a reference one — and the
    // result used to be indistinguishable from a real target. It is a number
    // somebody may eat to.
    it('reports every input it had to assume', () => {
      const t = computeTargets({});
      expect(t.personalised).toBe(false);
      expect(t.assumed).toEqual(
        expect.arrayContaining(['weightKg', 'heightCm', 'age', 'sex', 'activity', 'goal']),
      );
    });

    it('claims nothing was assumed when the citizen supplied everything', () => {
      const t = computeTargets({
        weightKg: 62, heightCm: 158, age: 41, sex: 'female', activity: 1.55, goal: 'lose',
      });
      expect(t.assumed).toEqual([]);
      expect(t.personalised).toBe(true);
    });

    it('names exactly the missing inputs, not all of them', () => {
      const t = computeTargets({ weightKg: 62, heightCm: 158, activity: 1.55, goal: 'lose' });
      expect(t.assumed.sort()).toEqual(['age', 'sex']);
      expect(t.personalised).toBe(false);
    });

    it('still returns usable numbers — this reports, it does not refuse', () => {
      // Refusing would break every screen that shows a target. The point is to
      // let the UI say what the number is based on, not to withhold it.
      const t = computeTargets({});
      expect(t.kcal).toBeGreaterThan(1000);
      expect(t.protein).toBeGreaterThan(0);
    });

    it('the assumed numbers are the documented reference body, not magic', () => {
      // Same inputs, stated explicitly, must produce the same answer — so the
      // fallback is a value anyone can look up rather than a constant buried in
      // an expression.
      const assumed = computeTargets({});
      const explicit = computeTargets({ ...REFERENCE_BODY });
      expect(assumed.kcal).toBe(explicit.kcal);
      expect(assumed.protein).toBe(explicit.protein);
      expect(explicit.assumed).toEqual([]);
    });

    it('treats a zero as missing rather than as an answer', () => {
      // 0 kg is not a body. The old `inp.weightKg || 70` had this behaviour by
      // accident; it is now the stated rule.
      expect(computeTargets({ weightKg: 0, heightCm: 158, age: 41, sex: 'female' }).assumed)
        .toContain('weightKg');
    });
  });
});
