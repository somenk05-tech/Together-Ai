import { clean, hasWord } from './allergens';

/**
 * What a declared medical condition takes off the shelf.
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT A NEW CLINICAL OPINION. The assessment
 * has always printed this sentence to a citizen who tells us they are pregnant:
 *
 *   "Pregnant/breastfeeding: avoid retinoids, high-dose salicylic acid and
 *    hydroquinone — safer alternatives suggested above."
 *
 * and then the SAME REQUEST handed them a 1% retinol serum, because
 * `recommendProducts` was called with `{ skinType, budget, allergies }` and
 * medical conditions never crossed that boundary. The prose swapped retinol for
 * bakuchiol; the shelf did not. Two answers to "may I use a retinoid", in one
 * response, and the one people act on was the wrong one.
 *
 * So this asserts nothing the product was not already telling people. It makes
 * an existing promise true, which is why the list is short and stays short.
 *
 * WHAT IS DELIBERATELY NOT HERE. Rosacea and eczema exclusions were considered
 * and left out: nothing in the hub currently promises them, and writing
 * "eczema means no fragrance" from memory is exactly the clinical claim
 * topical-sensitivities.ts refuses to make. A citizen with reactive skin is
 * served instead by the exfoliant load cap in budget-routine.ts, which is a
 * rule about how much a routine asks of a face rather than a claim about who
 * reacts to what. If dermatological sign-off ever arrives, it belongs here.
 *
 * SALICYLIC ACID IS ALSO NOT HERE, and that is the one omission worth naming.
 * The sentence above says "high-dose", and every salicylic product on this
 * shelf is 2% — the over-the-counter strength. Excluding all of it would take
 * away most of what treats acne, in service of a threshold none of these
 * products crosses. The caution says it; the filter does not act on it.
 */

export type ConditionKey = 'pregnancy';

interface ConditionRule {
  /** What the citizen might have typed or ticked. Matched on whole words. */
  declared: readonly string[];
  /** Ingredient words that are refused while this condition holds. */
  refuses: readonly string[];
  /** Words that look like a refusal and are not. Checked first. */
  except?: readonly string[];
  /** What to tell them, in their own frame rather than ours. */
  because: string;
}

const RULES: Record<ConditionKey, ConditionRule> = {
  pregnancy: {
    declared: ['pregnant', 'pregnancy', 'breastfeeding', 'breast feeding', 'nursing', 'lactating'],
    // The retinoid family as topical-sensitivities.ts already names it, plus the
    // one other ingredient the caution names by name.
    refuses: [
      'retinoid', 'retinoids', 'retinol', 'retinal', 'retinaldehyde', 'retinyl',
      'retinyl palmitate', 'retinyl propionate', 'tretinoin', 'adapalene',
      'tazarotene', 'granactive retinoid', 'hydroquinone',
    ],
    // Bakuchiol is the alternative the assessment offers in place of a retinoid
    // and its copy says so — a product refused for the word "retinol" in
    // "retinol alternative" would be the exact opposite of this rule.
    except: ['retinol alternative', 'retinol free', 'vitamin a rich', 'beta carotene'],
    because: 'you told us you are pregnant or breastfeeding',
  },
};

/** The conditions these declarations resolve to. Unknown strings resolve to none. */
export function conditionsDeclared(declared: readonly string[]): ConditionKey[] {
  const terms = declared.map((d) => clean(d)).filter(Boolean);
  if (!terms.length) return [];
  const out: ConditionKey[] = [];
  for (const [key, rule] of Object.entries(RULES) as Array<[ConditionKey, ConditionRule]>) {
    if (terms.some((t) => rule.declared.some((d) => hasWord(t, d)))) out.push(key);
  }
  return out;
}

export interface ContraindicationHit {
  condition: ConditionKey;
  /** The ingredient or product name carrying it — what to tell them. */
  found: string;
  /** The refused word, so a wrong exclusion can be argued with. */
  ingredient: string;
  because: string;
}

/**
 * The first reason this product is not for this citizen right now, or null.
 *
 * Reads the product NAME as well as its ingredients, for the same reason
 * findSensitivity does: "Olay Regenerist Retinol24 Night Moisturiser" says
 * retinol on the front of the bottle, and a shelf that only reads the
 * ingredient array is one derivation away from missing it.
 */
export function findContraindication(
  productName: string,
  ingredientNames: readonly string[],
  conditions: readonly ConditionKey[],
): ContraindicationHit | null {
  if (!conditions.length) return null;
  const candidates = [productName, ...ingredientNames].filter(Boolean);
  for (const condition of conditions) {
    const rule = RULES[condition];
    if (!rule) continue;
    for (const raw of candidates) {
      const text = clean(raw);
      if (!text) continue;
      if (rule.except?.some((e) => hasWord(text, e))) continue;
      const ingredient = rule.refuses.find((r) => hasWord(text, r));
      if (ingredient) return { condition, found: raw, ingredient, because: rule.because };
    }
  }
  return null;
}

/** The boolean the recommender wants. */
export function isSafeForConditions(
  productName: string,
  ingredientNames: readonly string[],
  conditions: readonly ConditionKey[],
): boolean {
  return findContraindication(productName, ingredientNames, conditions) === null;
}

/**
 * What a declared condition actually took off the shelf, so the citizen can be
 * told — the same argument topicalExclusions makes for allergies. A shelf that
 * is quietly shorter is indistinguishable from a thin catalogue, and this one
 * is shorter for a reason somebody has a right to hear.
 */
export function conditionExclusions(
  items: readonly { name: string; ingredients?: readonly string[] }[],
  conditions: readonly ConditionKey[],
): { removed: number; because: string[]; examples: string[] } {
  if (!conditions.length) return { removed: 0, because: [], examples: [] };
  const because = new Set<string>();
  const examples: string[] = [];
  let removed = 0;
  for (const it of items) {
    const hit = findContraindication(it.name, it.ingredients ?? [], conditions);
    if (!hit) continue;
    removed++;
    because.add(hit.because);
    if (examples.length < 3) examples.push(it.name);
  }
  return { removed, because: [...because], examples };
}
