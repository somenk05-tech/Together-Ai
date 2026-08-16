import { readFileSync } from 'fs';
import { join } from 'path';
import { computeBodyProgram } from '../fitness/fitness-engine';
import { computeTargets } from '../nutrition/nutrition.service';
import { FAT_KCAL_SHARE } from './energy';

/**
 * ONE BODY, ONE DAY, ONE NUMBER.
 *
 * The owner, 16 Aug, from two screenshots of his own account: 2455 kcal on the
 * Nutrition profile and 2993 on Fitness → Body Goal. "Why are there two calorie
 * parameters for one person."
 *
 * NOBODY HAD LIED AND THERE WAS NO SECOND EQUATION. one-body-one-number.spec
 * already forbids that, and it was passing: same Mifflin–St Jeor, same body,
 * same activity factor 1.55, same BMR 1931, same TDEE 2993. The entire gap was
 * that the citizen has TWO GOALS — a nutrition goal of "lose" (−18% → 2455) and
 * a body goal of Athletic, which means maintain (±0% → 2993). Two settings, two
 * days, no screen mentioning the other. Plus one point of fat share, 0.27
 * against 0.28, which was doing none of the work it was being blamed for.
 *
 * The owner's call: Nutrition owns the day's energy and the fat share, and the
 * body goal expresses itself in training and protein emphasis. The reason it
 * goes that way round is that Nutrition's number is the only one that was ever
 * load-bearing — every meal plan, portion, journal target and grocery list is
 * built from it, while the Fitness figure was read by nothing but its own page.
 *
 * Three shapes are pinned below, because each of them is a way for two numbers
 * to come back:
 *   1. the fitness page must PREFER the clinical energy and still say what its
 *      own goal would have asked for,
 *   2. the fat share must be one constant, not a per-goal table,
 *   3. sync must not push a goal back the other way — that button used to move
 *      a citizen's day by 538 kcal in silence.
 */
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** The owner's own body, from the screenshots. */
const BODY = { age: 41, sex: 'male' as const, heightCm: 181, weightKg: 100, activity: 1.55 };

describe('one body, one day, one number', () => {
  it('reproduces the two figures the owner saw, so the diagnosis is on the record', () => {
    const lose = computeTargets({ ...BODY, goal: 'lose' });
    const athletic = computeBodyProgram({ ...BODY, bodyGoal: 'athletic' });
    expect(athletic.bmr).toBe(1931);
    expect(athletic.tdee).toBe(2993);
    // Same body, same equation, same activity — and two different days, purely
    // because two settings disagreed.
    expect(lose.kcal).toBe(2455);
    expect(athletic.calorieTarget).toBe(2993);
  });

  it('shows Nutrition’s day on the body-goal page, and names the goal that disagrees', () => {
    const p = computeBodyProgram({
      ...BODY, bodyGoal: 'athletic', clinicalKcal: 2455, clinicalProteinG: 74,
      clinicalGoalLabel: 'losing weight',
    });
    expect(p.calorieTarget).toBe(2455);
    // The training figure is kept and named rather than dropped — the same
    // deal the protein note struck.
    expect(p.trainingKcal).toBe(2993);
    expect(p.calorieNote).toMatch(/2993 kcal/);
    expect(p.calorieNote).toMatch(/losing weight/);
    // …and it says where the setting lives, or it is an apology, not a route.
    expect(p.calorieNote).toMatch(/[Nn]utrition/);
    // BMR and TDEE survive: they are facts about a body, not targets.
    expect(p.tdee).toBe(2993);
    expect(p.bmr).toBe(1931);
  });

  it('says nothing when the two agree', () => {
    // A note that fires when there is no disagreement is noise, and noise is
    // how a real one stops being read.
    const p = computeBodyProgram({ ...BODY, bodyGoal: 'athletic', clinicalKcal: 2993 });
    expect(p.calorieTarget).toBe(2993);
    expect(p.calorieNote).toBeNull();
  });

  it('falls back to its own figure, unlabelled, when Nutrition cannot answer', () => {
    // A page that refuses to show a number because the other hub is slow is
    // worse than a page showing the number it can defend.
    const p = computeBodyProgram({ ...BODY, bodyGoal: 'athletic' });
    expect(p.calorieTarget).toBe(2993);
    expect(p.calorieNote).toBeNull();
  });

  it('rebalances the whole row off whichever day won', () => {
    const p = computeBodyProgram({
      ...BODY, bodyGoal: 'athletic', clinicalKcal: 2455, clinicalProteinG: 74,
    });
    const m = p.macros as { proteinG: number; fatG: number; carbG: number };
    // Fat is the city's share of the day that is actually being eaten…
    expect(m.fatG).toBe(Math.round((2455 * FAT_KCAL_SHARE) / 9));
    // …and the row adds back up to it, rather than only the calorie cell
    // agreeing with Nutrition while fat and carbs quietly describe another day.
    const sum = m.proteinG * 4 + m.fatG * 9 + m.carbG * 4;
    expect(sum).toBeGreaterThan(2455 - 6);
    expect(sum).toBeLessThan(2455 + 6);
  });

  it('gives the same person the same fat and carbs in both hubs', () => {
    // The end of the defect, stated as the thing the owner will check: put the
    // same day through both and every macro matches.
    const n = computeTargets({ ...BODY, goal: 'lose' });
    const f = computeBodyProgram({
      ...BODY, bodyGoal: 'athletic', clinicalKcal: n.kcal, clinicalProteinG: n.protein,
    });
    expect(f.calorieTarget).toBe(n.kcal);
    expect(f.macros?.proteinG).toBe(n.protein);
    expect(f.macros?.fatG).toBe(n.fat);
    expect(f.macros?.carbG).toBe(n.carb);
  });

  it('keeps one fat share for the city, not a table per goal', () => {
    const fe = src('fitness/fitness-engine.ts');
    // 0.27 / 0.28 / 0.30 per body goal is where 74 g and 93 g came apart even
    // before the calories did.
    expect(fe).not.toMatch(/fatPct/);
    expect(fe).toMatch(/FAT_KCAL_SHARE/);
    expect(src('nutrition/nutrition.service.ts')).toMatch(/const fatPct = FAT_KCAL_SHARE;/);
    // And every goal now produces the same fat on the same day.
    const fats = ['buildMuscle', 'leanDefine', 'athletic', 'fatLoss'].map((bodyGoal) =>
      computeBodyProgram({ ...BODY, bodyGoal, clinicalKcal: 2455, clinicalProteinG: 74 }).macros?.fatG);
    expect(new Set(fats).size).toBe(1);
  });

  it('asks Nutrition once for the whole day rather than field by field', () => {
    const s = src('fitness/fitness.service.ts');
    expect(s).toMatch(/private async clinicalTargets\(/);
    expect(s).toMatch(/clinicalProteinG: num\(t\?\.protein\)/);
    expect(s).toMatch(/clinicalKcal: num\(t\?\.kcal\)/);
    // Two reads of a profile mid-edit is two different days on one screen.
    const reads = s.match(/this\.nutrition\.targets\(userId\)/g) ?? [];
    expect(reads.length).toBe(1);
  });

  it('never pushes a goal back into Nutrition over one already there', () => {
    // THE BUTTON THAT MOVED A DAY BY 538 KCAL IN SILENCE. `syncNutrition` used
    // to write `goal: program.nutrition.goal` on update, so one press turned
    // this citizen's "lose" into "maintain" and regenerated their week against
    // it. Body facts still sync; a goal is a decision and Nutrition is where it
    // is taken. A row being CREATED still needs one — that is the only intent
    // on record at that moment.
    const s = src('fitness/fitness.service.ts');
    const update = s.slice(s.indexOf('await this.prisma.foodPref.upsert'), s.indexOf('return {\n      synced: true'));
    expect(update).toMatch(/update: body,/);
    expect(update).toMatch(/create: \{ userId, goal: program\.nutrition\.goal, \.\.\.body \}/);
    expect(s).toMatch(/const body = \{ heightCm:/);
  });
});
