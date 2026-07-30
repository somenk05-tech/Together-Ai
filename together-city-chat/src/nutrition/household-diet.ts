import { FORBIDDEN_BY_DIET, type DietKey, type DietTag } from './diet-tags';

/**
 * One table, one diet (BE-12.1).
 *
 * A household meal plan is a single set of dishes that everybody at the table
 * eats. The planner built it from the OWNER's diet alone. So a household where
 * the owner eats everything and one member is vegetarian got a week of chicken,
 * and the vegetarian member's "personalised view" of it was the same chicken,
 * scaled to their calorie target. The allergies were merged across the
 * household — that was done, and done deliberately — but the diet was not, and
 * a diet is not a preference you can scale a portion of.
 *
 * The rule is simply the union: a dish must be one that EVERY member could eat,
 * so the plan is built against the union of everything the household forbids.
 *
 * That union does not always name a diet anybody in the house holds, and it
 * should not have to. A vegan and a Jain in one household forbid, between them,
 * meat, fish, egg, dairy, honey, onion, garlic and root vegetables — which is
 * `jainvegan`, a key the recipe corpus already carries and no citizen ever
 * selects. Working in tags rather than diet names is what makes that fall out
 * instead of needing a special case.
 */

const TAGS = (key: DietKey): readonly DietTag[] => FORBIDDEN_BY_DIET[key] ?? FORBIDDEN_BY_DIET.vegetarian;

/**
 * Candidates in order of increasing strictness. Aliases are left out — `veg`
 * forbids exactly what `vegetarian` does, and returning two names for one diet
 * would only give callers something to get wrong.
 */
const CANDIDATES: readonly DietKey[] = ['everything', 'pesc', 'egg', 'vegetarian', 'vegan', 'jain', 'jainvegan'];

const SYNONYMS: Record<string, DietKey> = {
  everything: 'everything', all: 'everything', omnivore: 'everything',
  nonveg: 'everything', 'non-veg': 'everything', nonvegetarian: 'everything', 'non-vegetarian': 'everything',
  pesc: 'pesc', pescatarian: 'pesc', fish: 'pesc', fishetarian: 'pesc',
  egg: 'egg', eggetarian: 'egg', ovo: 'egg',
  veg: 'vegetarian', vegetarian: 'vegetarian', lactovegetarian: 'vegetarian', 'lacto-vegetarian': 'vegetarian',
  vegan: 'vegan', plantbased: 'vegan', 'plant-based': 'vegan',
  jain: 'jain',
  jainvegan: 'jainvegan', 'jain-vegan': 'jainvegan',
};

/**
 * A diet key from whatever was typed into the column.
 *
 * An unrecognised value becomes `vegetarian`, not `everything`. This is the
 * only defensible direction: the value is unreadable, somebody is going to eat
 * the result, and a plate of vegetables served to a meat-eater is a
 * disappointment while the reverse is a betrayal.
 */
export function normaliseDietKey(raw?: string | null): DietKey {
  const k = (raw ?? '').toLowerCase().trim().replace(/[\s_]+/g, '');
  return SYNONYMS[k] ?? SYNONYMS[k.replace(/-/g, '')] ?? 'vegetarian';
}

/** Everything the household forbids between them. */
export function householdForbids(diets: Iterable<string | null | undefined>): Set<DietTag> {
  const out = new Set<DietTag>();
  for (const d of diets) for (const t of TAGS(normaliseDietKey(d))) out.add(t);
  return out;
}

/**
 * The diet to build one shared plan against: the least restrictive one that
 * still forbids everything anybody at this table forbids.
 *
 * An empty household is `everything` — there is nobody to constrain it, and the
 * callers only reach this with at least the owner in the list.
 */
export function strictestDiet(diets: Iterable<string | null | undefined>): DietKey {
  const forbidden = householdForbids(diets);
  if (!forbidden.size) return 'everything';
  for (const c of CANDIDATES) {
    const tags = TAGS(c);
    if ([...forbidden].every((t) => tags.includes(t))) return c;
  }
  // Unreachable while `jainvegan` forbids the union of every other key, which
  // dietary-integrity.spec asserts. Returning it anyway beats returning
  // something permissive if that ever stops being true.
  return 'jainvegan';
}

/**
 * Whose diet had to be honoured, for the sentence shown beside the plan.
 * Empty when the plan is simply the owner's own diet — there is nothing to
 * explain in that case and a notice that fires every week stops being read.
 */
export function stricterThanOwner(
  ownerDiet: string | null | undefined,
  members: readonly { name: string; diet?: string | null }[],
): { diet: DietKey; because: string[] } | null {
  const household = strictestDiet([ownerDiet, ...members.map((m) => m.diet)]);
  if (household === normaliseDietKey(ownerDiet)) return null;
  const ownerTags = TAGS(normaliseDietKey(ownerDiet));
  const because = members
    .filter((m) => TAGS(normaliseDietKey(m.diet)).some((t) => !ownerTags.includes(t)))
    .map((m) => m.name)
    .filter(Boolean);
  return { diet: household, because };
}
