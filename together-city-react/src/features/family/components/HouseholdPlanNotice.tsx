import { Link } from 'react-router-dom';
import { useFamilyMealPlanning } from '@/features/nutrition/hooks';

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
        family ({headcount})</b>, and every member's allergies and avoided foods are applied to the shared dishes.{' '}
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
      following this plan. It is <b>yours</b>, but every member's allergies and avoided foods are still applied to it,
      so it stays safe to cook for the table ({headcount}).{' '}
      {ctx.role === 'owner'
        ? <><Link to="/family/connect">Turn shared planning on</Link> to put the household back on one plan.</>
        : <>Your household owner can turn shared planning back on.</>}
    </p>
  );
}
