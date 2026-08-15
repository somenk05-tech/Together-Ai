import { sensitivitiesIn } from '../shared/topical-sensitivities';
import { clean, hasWord } from '../shared/allergens';
import type { BeautyProduct } from './beauty-engine';

/**
 * Which ACTIVE a product is really delivering, so a routine cannot deliver it
 * three times.
 *
 * THE ROUTINE THIS EXISTS TO REFUSE. An oily/acne profile at a ₹10,000 face
 * budget was answered with salicylic acid in the moisturiser, salicylic acid in
 * the serum, salicylic acid in the toner, an AHA-and-walnut-shell mask, and 1%
 * retinol on top. Every one of those five picks was individually compatible,
 * individually within budget, individually the best-matched thing for its own
 * role — and nothing anywhere looked at the other four. `actives` was read by
 * the allergy filter and by the product card, and by no rule that chooses.
 *
 * ONE VOCABULARY, NOT A SECOND ONE. Four of these families are already named,
 * argued and tested in topical-sensitivities.ts, so they are read from there
 * rather than re-listed here — the same reason allergens.ts is one matcher.
 * Only what that file has no reason to know about is added below.
 *
 * WHAT IS DELIBERATELY NOT A FAMILY HERE. Vitamin C. It stacks without
 * irritating, it appears as a trace antioxidant in a great many sunscreens and
 * moisturisers, and refusing a sunscreen because the serum already had some
 * would be the filter doing harm. Its one real interaction is with a retinoid
 * and it is a question of WHEN rather than whether — routine-engine.ts has said
 * so on the page since it was written, and that is the right place for it.
 *
 * THESE ARE NAMING FACTS. "Salicylic acid is a BHA" and "walnut shell powder is
 * a physical exfoliant" are statements about what an ingredient is. How much
 * stacking a given face tolerates is a clinical question and this file does not
 * answer it; budget-routine.ts sets the load cap, from the citizen's own
 * redness reading, where it can be read next to the rest of the policy.
 */

export type ActiveFamily =
  | 'bha' | 'aha' | 'retinoid' | 'benzoyl-peroxide'
  | 'physical-exfoliant' | 'antifungal';

/**
 * Families that ask something of the skin barrier. Two of these in one routine
 * is a decision; four is an accident.
 */
export const IRRITANT_FAMILIES: readonly ActiveFamily[] = [
  'bha', 'aha', 'retinoid', 'benzoyl-peroxide', 'physical-exfoliant',
];

/** What topical-sensitivities.ts already knows, under this file's names. */
const FROM_SENSITIVITIES: Record<string, ActiveFamily> = {
  salicylate: 'bha',
  aha: 'aha',
  retinoid: 'retinoid',
  benzoylPeroxide: 'benzoyl-peroxide',
};

/** The two it has no reason to know about. */
const EXTRA: Record<Exclude<ActiveFamily, 'bha' | 'aha' | 'retinoid' | 'benzoyl-peroxide'>, readonly string[]> = {
  // Particles, not acids. A scrub on top of two acids is the same ask.
  'physical-exfoliant': [
    'walnut shell', 'walnut shell powder', 'apricot kernel', 'apricot seed',
    'microbead', 'microbeads', 'pumice', 'sugar scrub', 'salt scrub',
    'coffee grounds', 'shell powder', 'seed powder',
  ],
  // The dandruff actives. Two of them is two courses of the same treatment.
  antifungal: [
    'ketoconazole', 'zinc pyrithione', 'pyrithione zinc', 'zpt',
    'selenium sulfide', 'selenium sulphide', 'climbazole', 'piroctone olamine',
  ],
};

const CACHE = new Map<string, ReadonlySet<ActiveFamily>>();

/** An active named with a strength — "Salicylic Acid 2%", "Retinol 0.3%". */
const DOSED = /\d\s*%/;

/**
 * Every active family this product DELIVERS, which is not every family it
 * contains.
 *
 * ── THE DISTINCTION THIS FILE TURNS ON, AND IT COST A REGRESSION TO FIND ────
 *
 * The first version read every ingredient equally, and a sunscreen listing
 * "Vitamin A (Retinyl Palmitate)" third on its actives blocked a retinol NIGHT
 * MOISTURISER that answered three of the citizen's findings, in favour of one
 * that answered two. A trace ester in an SPF is not a course of retinoid, and a
 * guard that says it is takes real treatment away to prevent an imaginary
 * stack. `budget-is-a-limit.spec.ts` caught it in the one assertion written to
 * catch exactly that — "never buys a worse-matched product than one it could
 * have had for the money".
 *
 * SO AN ACID OR A RETINOID COUNTS WHERE THE BOTTLE SAYS SO: in the product
 * NAME, as the keyIngredient, or in an active carrying a percentage. Those are
 * the three ways this catalogue states a treatment claim, and a formula that
 * makes none of them is not selling that active. It is a naming fact and not a
 * clinical threshold — nothing here says what strength does what.
 *
 * PARTICLES AND ANTI-DANDRUFF ACTIVES ARE READ ANYWHERE IN THE FORMULA, because
 * there is no trace amount of walnut shell. A scrub either has grit in it or it
 * does not, and ketoconazole is not a supporting note.
 */
export function activeFamiliesOf(
  p: Pick<BeautyProduct, 'name' | 'actives' | 'keyIngredient'>,
): ReadonlySet<ActiveFamily> {
  const actives = p.actives ?? [];
  // What the bottle claims to be delivering.
  const claimed = clean([p.name, p.keyIngredient, ...actives.filter((a) => DOSED.test(a))].filter(Boolean).join(' · '));
  // Everything in it.
  const present = clean([p.name, p.keyIngredient, ...actives].filter(Boolean).join(' · '));
  const key = `${claimed}||${present}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const out = new Set<ActiveFamily>();
  for (const s of sensitivitiesIn(claimed)) {
    const family = FROM_SENSITIVITIES[s];
    if (family) out.add(family);
  }
  for (const [family, words] of Object.entries(EXTRA) as Array<[ActiveFamily, readonly string[]]>) {
    if (words.some((w) => hasWord(present, w))) out.add(family);
  }
  CACHE.set(key, out);
  return out;
}

/** How many barrier-taxing families a set of products asks for, counted once each. */
export function irritantLoad(
  products: readonly Pick<BeautyProduct, 'name' | 'actives' | 'keyIngredient'>[],
): number {
  const seen = new Set<ActiveFamily>();
  for (const p of products) {
    for (const f of activeFamiliesOf(p)) if (IRRITANT_FAMILIES.includes(f)) seen.add(f);
  }
  return seen.size;
}

export interface OverlapRefusal {
  /** 'duplicate' — this active is already in the routine. 'load' — too many at once. */
  kind: 'duplicate' | 'load';
  family: ActiveFamily;
}

/**
 * Why this candidate cannot join this routine, or null.
 *
 * TWO RULES AND THEY ARE DIFFERENT COMPLAINTS. A duplicate is waste and a
 * doubled dose of one thing; a load breach is five reasonable things adding up
 * to an unreasonable week. Naming which one refused a product is what lets the
 * plan say something true about it afterwards.
 */
export function overlapRefusal(
  candidate: Pick<BeautyProduct, 'name' | 'actives' | 'keyIngredient'>,
  chosen: readonly Pick<BeautyProduct, 'name' | 'actives' | 'keyIngredient'>[],
  loadCap: number,
): OverlapRefusal | null {
  const mine = activeFamiliesOf(candidate);
  if (!mine.size) return null;

  const theirs = new Set<ActiveFamily>();
  for (const p of chosen) for (const f of activeFamiliesOf(p)) theirs.add(f);

  for (const f of mine) if (theirs.has(f)) return { kind: 'duplicate', family: f };

  const before = irritantLoad(chosen);
  const after = irritantLoad([...chosen, candidate]);
  if (after > loadCap && after > before) {
    const added = [...mine].find((f) => IRRITANT_FAMILIES.includes(f) && !theirs.has(f));
    if (added) return { kind: 'load', family: added };
  }
  return null;
}

/** "salicylic acid (BHA)" — the family, in the words on a bottle. */
export const FAMILY_LABEL: Record<ActiveFamily, string> = {
  bha: 'salicylic acid (BHA)',
  aha: 'an AHA',
  retinoid: 'a retinoid',
  'benzoyl-peroxide': 'benzoyl peroxide',
  'physical-exfoliant': 'a physical scrub',
  antifungal: 'an anti-dandruff active',
};
