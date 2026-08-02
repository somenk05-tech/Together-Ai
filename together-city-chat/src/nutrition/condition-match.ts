/**
 * ONE PLACE THAT DECIDES WHETHER A CITIZEN HAS A CONDITION.
 *
 * Nine files in this hub asked that question nine ways, and the disagreements
 * are not academic — every one of these strings is in the hub's own fixtures:
 *
 *  · 'dialysis' on its own. `activeMntRules` tests kidney|renal|ckd BEFORE it
 *    looks for dialysis, so somebody recorded only as "dialysis" got the
 *    Renal Friendly badge, got the supplement caution, and got NO protein,
 *    potassium or phosphorus ceiling. The most restrictive rule in the engine,
 *    unreachable by the plainest way of saying it applies.
 *  · 'fattyliver', no space. `has('fatty liver')` misses it; so does
 *    clinical-mnt's list. No rule.
 *  · 'highchol'. `has('cholesterol')` misses it. No dyslipidemia rule.
 *  · 'nephropathy'. The recipe filter matched `nephro` and the clinical rule
 *    did not, so the plate was filtered and the ceilings were not.
 *  · 'Diabetic'. `/diab/i` at one site, `has('diabetes')` at another —
 *    the wallet-side path fires, the MNT rule does not.
 *  · And the narrowest of all: `assignDietPlans` asks `has('kidney')` alone, so
 *    "CKD stage 4" and "renal disease" got no renal PLAN while the clinical
 *    rule fired. The plan and the ceilings disagreed about the same person.
 *
 * THE UNION, NOT THE INTERSECTION. Every list here is at least as wide as the
 * widest matcher it replaces, so this commit can only make MORE rules fire for
 * a given citizen — tighter caps, never looser. That is the only direction a
 * change like this may safely be made without re-deciding clinical policy: a
 * rule that fires when it should not is a plan somebody dislikes, and a rule
 * that fails to fire is a ceiling nobody was held to.
 *
 * SHORT AND AMBIGUOUS TERMS CARRY WORD BOUNDARIES. `ckd`, `nash`, `htn`, `t1d`
 * are three or four letters and appear inside ordinary words — `nash` is inside
 * Nashik. The long ones do not need them, and `diab` is deliberately a prefix
 * so 'diabetes', 'diabetic' and 'prediabetes' all land in one place.
 *
 * WHAT THIS IS NOT. It is not the declared vocabulary — `shared/health-
 * conditions.ts` is the twelve keys a citizen can tick, and this file matches
 * the free TEXT that hubs have stored for years, including everything typed
 * before that vocabulary existed. The two meet when the readers converge; until
 * then this is the one that decides what an old string means.
 */

export const CONDITION_KEYS = [
  'kidney', 'diabetes', 'hypertension', 'dyslipidemia', 'fattyLiver',
  'gout', 'pcos', 'thyroid', 'pregnancy', 'breastfeeding',
] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];

/** The union of every spelling any matcher in this hub has ever accepted. */
const TERMS: Record<ConditionKey, RegExp> = {
  kidney: /kidney|renal|nephro|dialys|\bckd\b/i,
  diabetes: /diab|\bt1d\b|\bt2d\b/i,
  hypertension: /hypertens|blood pressure|\bhtn\b/i,
  dyslipidemia: /cholesterol|highchol|lipid|triglycer|dyslipid/i,
  fattyLiver: /fatty ?liver|\bnafld\b|\bmasld\b|\bnash\b|hepatic steatosis/i,
  gout: /gout|uric/i,
  pcos: /\bpcos\b|polycystic/i,
  thyroid: /thyroid|hashimoto/i,
  pregnancy: /pregnan/i,
  breastfeeding: /breastfeed|lactat|nursing/i,
};

/**
 * The canonical term each call site used to pass, mapped to its key.
 *
 * This exists so the `has(...)` helpers dotted through the hub keep their exact
 * call sites — `has('kidney', 'renal', 'ckd')` still reads the same, it just
 * stops being the definition of what kidney means. Terms NOT in here fall back
 * to a plain substring test, which is what keeps the kidney STAGING
 * ('dialysis', 'stage 3') working as a sub-question rather than folding into
 * the condition itself.
 */
const TERM_TO_KEY: Record<string, ConditionKey> = {
  kidney: 'kidney', renal: 'kidney', ckd: 'kidney', nephro: 'kidney',
  diabetes: 'diabetes', diabetic: 'diabetes', diab: 'diabetes',
  hypertension: 'hypertension', 'blood pressure': 'hypertension',
  cholesterol: 'dyslipidemia', lipid: 'dyslipidemia', triglyceride: 'dyslipidemia',
  'fatty liver': 'fattyLiver', nafld: 'fattyLiver', masld: 'fattyLiver', nash: 'fattyLiver',
  gout: 'gout', uric: 'gout',
  pcos: 'pcos', thyroid: 'thyroid',
  pregnancy: 'pregnancy', pregnan: 'pregnancy',
  breastfeeding: 'breastfeeding', breastfeed: 'breastfeeding', lactat: 'breastfeeding',
};

/** The key a legacy call-site term stands for, or undefined if it is a
 *  sub-question (staging) that must stay a literal substring test. */
export function conditionKeyForTerm(term: string): ConditionKey | undefined {
  return TERM_TO_KEY[term.trim().toLowerCase()];
}

/** Whether any of these condition strings means `key`. */
export function hasCondition(
  conditions: readonly string[] | null | undefined,
  key: ConditionKey,
): boolean {
  const re = TERMS[key];
  return (conditions ?? []).some((c) => re.test(c ?? ''));
}

/** Every condition these strings mean, in CONDITION_KEYS order. */
export function conditionKeys(conditions: readonly string[] | null | undefined): ConditionKey[] {
  return CONDITION_KEYS.filter((k) => hasCondition(conditions, k));
}

/**
 * A `has(...)` with the same shape every call site already uses, so converting
 * a file is one line rather than twenty.
 *
 * A term this file knows is answered by the shared matcher; anything else falls
 * through to the substring test the call site had before, which is how
 * `has('dialysis')` and `has('stage 3')` keep meaning exactly what they meant.
 */
export function conditionMatcher(conditions: readonly string[] | null | undefined) {
  const lower = (conditions ?? []).map((c) => (c ?? '').toLowerCase());
  return (...terms: string[]): boolean => terms.some((t) => {
    const key = conditionKeyForTerm(t);
    if (key) return hasCondition(conditions, key);
    return lower.some((c) => c.includes(t.toLowerCase()));
  });
}
