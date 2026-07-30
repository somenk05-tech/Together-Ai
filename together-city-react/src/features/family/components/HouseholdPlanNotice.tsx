import { Link } from 'react-router-dom';
import { useFamilyMealPlanning } from '@/features/nutrition/hooks';
import type { DietKey } from '@/features/nutrition/api';

const DIET_NAME: Record<DietKey, string> = {
  everything: 'no dietary restriction',
  nonveg: 'no dietary restriction',
  pesc: 'pescatarian',
  egg: 'eggetarian',
  veg: 'vegetarian',
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  jain: 'Jain',
  jainvegan: 'Jain and vegan',
};

/** Reads as a sentence: "because Meera is" / "because Meera and Anil are". */
function names(list: string[]): string {
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * Why the shared plan follows a stricter diet than the owner's own.
 *
 * The planner used to build the household plan from the owner's diet alone, so
 * a house where the owner ate everything and one member was vegetarian got a
 * week of chicken — and that member's "personalised" view of it was the same
 * chicken, scaled to their calorie target. The plan now follows the union of
 * what the table forbids, and this is the sentence that makes that visible
 * rather than mysterious. Without the reason, "this plan is vegetarian" reads
 * like a bug to somebody who eats meat.
 */
function DietNote({ diet, because }: { diet: DietKey; because: string[] }) {
  if (!because.length) return null;
  const verb = because.length === 1 ? 'is' : 'are';
  return (
    <>
      {' '}These dishes are <b>{DIET_NAME[diet] ?? diet}</b>, because {names(because)} {verb} — one table, one set of
      dishes.
    </>
  );
}

/**
 * What this plan actually is, given the household's settings.
 *
 * The Family planner used to state flatly: "This is your family meal plan — the
 * same for everyone." That is true only while Household Meal Planning is ON.
 * Switched OFF, every member plans independently, and this page carried on
 * telling the owner the household was eating what they were looking at.
 *
 * The plan itself stays useful either way — every member's allergies and
 * avoided foods are applied to it regardless, which is what makes it safe to
 * cook from for the table. What changes is who is actually following it, and
 * that is the part the page has to be honest about.
 */
export function HouseholdPlanNotice({ people }: { people: number }) {
  const { query } = useFamilyMealPlanning();
  const ctx = query.data;

  // Say nothing until we know, rather than flashing the wrong claim first.
  if (!ctx) return null;

  const shared = ctx.hasFamily && ctx.familyMealPlanning;
  const headcount = `${people} ${people === 1 ? 'person' : 'people'}`;

  if (shared) {
    return (
      <p className="note">
        This is your <b>family meal plan</b> — the same for everyone. <b>Mains are cooked together for the whole
        family ({headcount})</b>, and every member's diet, allergies and avoided foods are applied to the shared
        dishes.<DietNote diet={ctx.householdDiet} because={ctx.dietBecause} />{' '}
        <b>Snacks are personalised</b> per member's health need.
      </p>
    );
  }

  if (!ctx.hasFamily) {
    return (
      <p className="note">
        You don't have a household yet, so this plan is yours alone. <Link to="/family/connect">Invite someone</Link>{' '}
        and their needs are applied to the shared dishes automatically.
      </p>
    );
  }

  return (
    <p className="note">
      <b>Household meal planning is off</b>, so everyone in your household is planning independently — nobody else is
      following this plan. It is <b>yours</b>, but every member's diet, allergies and avoided foods are still applied
      to it, so it stays safe to cook for the table ({headcount}).<DietNote diet={ctx.householdDiet} because={ctx.dietBecause} />{' '}
      {ctx.role === 'owner'
        ? <><Link to="/family/connect">Turn shared planning on</Link> to put the household back on one plan.</>
        : <>Your household owner can turn shared planning back on.</>}
    </p>
  );
}
