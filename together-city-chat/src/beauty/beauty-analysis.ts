// Deterministic skin & hair assessment. Generated ONCE when the user saves their
// profile (or uploads photos) and then cached — no per-open AI. Turns the stated
// profile + concerns + any photo findings into per-attribute readings, the top
// issues, and a routine tuned to their goals, allergies and medical conditions.

import { findSensitivity } from '../shared/topical-sensitivities';
import { joinTerms } from '../shared/allergen-voice';

export type Level = 'good' | 'monitor' | 'attention' | 'priority';
/**
 * `intensity` is the RAW SIGNAL COUNT that produced `level`, kept rather than
 * discarded. `rank()` collapses 0,1,2,3+ into four words, and until now the
 * number went no further — so a citizen with three separate acne signals and one
 * with a single ticked box arrived at the recommender indistinguishable. The
 * scorer needs the difference: with only four severities, and a breadth bonus
 * capped at two, `matchScore` had exactly two realised values across a matched
 * shelf and every tie fell through to price.
 *
 * Absent on an assessment saved before this field existed. Readers must treat
 * `undefined` as "whatever the level implies" rather than as zero — see
 * `intensityOf` in beauty-engine.ts. No backfill, no migration.
 */
export interface Reading { key: string; label: string; level: Level; note: string; intensity: number }
export interface RoutineStep { step: string; ingredient?: string }
export interface IngredientRec { name: string; why: string }
export interface MakeupRec { item: string; note: string }

/**
 * HOW MANY FINDINGS A SUMMARY NAMES, AND THE ONE PLACE THAT DECIDES IT.
 *
 * Three, because a summary is a summary: a citizen with seven readings on
 * attention does not need all seven in the opening sentence, they need the
 * order to start in. The readings are all there, one section down, unabridged.
 *
 * It is a function rather than a line inside `assessBeauty` because an
 * assessment saved in March has its `issues` on file and its `focus` computed
 * by a version of this file that did not have the field. The service derives it
 * on read through this, so an old row and a new one answer the same way and
 * nothing has to be migrated. One rule; two callers; no backfill script.
 */
export const FOCUS_LIMIT = 3;
export function focusOf(
  a: { skin?: { issues?: string[] } | null; hair?: { issues?: string[] } | null } | null | undefined,
): string[] {
  return [...(a?.skin?.issues ?? []), ...(a?.hair?.issues ?? [])].slice(0, FOCUS_LIMIT);
}

/**
 * The sentence after the priorities one, for an assessment stored before `note`
 * existed. Both halves come out of the same file, so the split is on the join
 * this file makes — a single space after the first full stop — and not on prose
 * parsing. Returns '' when there is no second sentence, and the card shows no
 * qualifier rather than a fragment.
 */
export function noteOf(summary: string): string {
  const at = (summary ?? '').indexOf('. ');
  return at === -1 ? '' : summary.slice(at + 2);
}

export interface BeautyAssessment {
  /**
   * The whole answer as one paragraph. It stays, unchanged and first, and it is
   * still what anything without a typographic opinion should print.
   */
  summary: string;
  /**
   * THE SAME ANSWER IN ITS PARTS, because the profile page now SETS this rather
   * than printing it: the priorities in display type, the qualifier beneath
   * them in italic. A page cannot typeset a sentence it has to take apart
   * first, and taking it apart in the browser would put the rule that composed
   * it in two places — the same objection as recomputing `lastsLabel` there.
   *
   * `focus` is the up-to-three findings the sentence names. `note` is the
   * sentence after it. Together they rebuild `summary` exactly, and a test
   * asserts that rather than trusting it.
   */
  focus: string[];
  note: string;
  skin: { readings: Reading[]; issues: string[]; recommendations: string[] };
  hair: { readings: Reading[]; issues: string[]; recommendations: string[] };
  ingredients: IngredientRec[];
  routine: { am: RoutineStep[]; pm: RoutineStep[]; weekly: RoutineStep[]; seasonal: string };
  makeup: MakeupRec[];
  cautions: string[];
}

export interface BeautyProfileInput {
  age?: number; gender?: string; lifestyle?: string; city?: string;
  skinType?: string; skinTone?: string; undertone?: string;
  skinGoals?: string[]; skinConcerns?: string[];
  hairType?: string; hairThickness?: string; hairDensity?: string; hairTexture?: string;
  hairGoals?: string[]; hairConcerns?: string[]; scalpType?: string;
  routine?: string[]; allergies?: string[]; medicalConditions?: string[]; budget?: string;
}

const norm = (xs?: string[]) => (xs ?? []).map((x) => String(x).toLowerCase());
const has = (list: string[], ...keys: string[]) => keys.some((k) => list.some((v) => v.includes(k)));
const worst = (...ls: Level[]): Level => {
  const order: Level[] = ['good', 'monitor', 'attention', 'priority'];
  return ls.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), 'good');
};
const rank = (n: number): Level => (n >= 3 ? 'priority' : n === 2 ? 'attention' : n === 1 ? 'monitor' : 'good');

/** Build the saved assessment from the profile (+ optional photo-detected tags). */
export function assessBeauty(p: BeautyProfileInput, photoFindings: string[] = []): BeautyAssessment {
  const concerns = norm(p.skinConcerns);
  const goals = norm(p.skinGoals);
  const hairC = norm(p.hairConcerns);
  const hairG = norm(p.hairGoals);
  const conds = norm(p.medicalConditions);
  const allergies = norm(p.allergies);
  const pf = norm(photoFindings);
  const skinType = (p.skinType ?? 'normal').toLowerCase();
  const scalp = (p.scalpType ?? 'normal').toLowerCase();
  const age = p.age ?? 0;

  const pregnant = has(conds, 'pregnan', 'breastfeed');
  /**
   * This was a bidirectional substring test:
   *
   *     allergies.some((a) => name.includes(a) || a.includes(name))
   *
   * and it was wrong in both directions at once. Under-exclusion: "salicylates"
   * is not a substring of "Salicylic acid (BHA)", so the one ingredient a
   * salicylate-sensitive citizen must not be handed was recommended to them by
   * name. Over-exclusion: the reversed half meant a declared "coconut oil"
   * matched any recommendation whose name is a substring of it.
   *
   * findSensitivity matches on whole words and on families, so a declared term
   * reaches the things it actually means and stops there.
   */
  //
  // K5.66 — it also REMEMBERS what it avoided. The caution below used to fire on
  // the mere presence of a declared sensitivity, which says something true about
  // the profile and something unproven about this assessment. Recording the
  // terms that actually changed a suggestion makes the sentence an event.
  const avoidedTerms = new Set<string>();
  const avoid = (name: string) => {
    const hit = findSensitivity(name, [], allergies);
    if (hit) avoidedTerms.add(hit.term);
    return !!hit;
  };

  // ---- Skin readings ----
  const skin: Reading[] = [];
  const acneN = [has(concerns, 'acne', 'pimple'), has(concerns, 'whitehead', 'blackhead'), has(conds, 'hormonal acne', 'pcos', 'seborrheic'), has(pf, 'acne')].filter(Boolean).length;
  skin.push({ key: 'acne', label: 'Acne & breakouts', level: worst(rank(acneN), has(goals, 'acne') ? 'monitor' : 'good'), note: acneN ? 'Active breakouts or acne history noted' : 'No active acne reported', intensity: acneN });
  const pigN = [has(concerns, 'dark spot', 'hyperpig', 'melasma'), has(concerns, 'tan', 'sun damage'), has(pf, 'pigment')].filter(Boolean).length;
  skin.push({ key: 'pigmentation', label: 'Pigmentation & spots', level: worst(rank(pigN), has(goals, 'pigment', 'dark spot', 'tan', 'even') ? 'monitor' : 'good'), note: pigN ? 'Uneven tone / dark spots to address' : 'Even tone', intensity: pigN });
  const wrinkleN = [has(concerns, 'fine line', 'wrinkle'), age >= 40, has(pf, 'wrinkle')].filter(Boolean).length;
  skin.push({ key: 'wrinkles', label: 'Fine lines & firmness', level: worst(rank(wrinkleN), has(goals, 'ageing', 'aging', 'wrinkle', 'fine line', 'firm') ? 'monitor' : 'good'), note: wrinkleN ? 'Early lines / loss of firmness' : 'Firm, few lines', intensity: wrinkleN });
  const texN = [has(concerns, 'uneven texture', 'large pore'), has(pf, 'texture', 'pore')].filter(Boolean).length;
  skin.push({ key: 'texture', label: 'Texture & pores', level: worst(rank(texN), has(goals, 'pore', 'glass', 'glow') ? 'monitor' : 'good'), note: texN ? 'Rough texture / visible pores' : 'Smooth texture', intensity: texN });
  const redN = [has(concerns, 'rosacea', 'redness'), skinType === 'sensitive', has(conds, 'rosacea', 'eczema', 'psoriasis'), has(pf, 'redness')].filter(Boolean).length;
  skin.push({ key: 'redness', label: 'Redness & sensitivity', level: rank(redN), note: redN ? 'Reactive / inflamed skin — patch-test new actives' : 'Calm, non-reactive', intensity: redN });
  const hydN = [has(concerns, 'dry', 'flaky', 'dull'), skinType === 'dry', has(pf, 'dehydrat', 'dry')].filter(Boolean).length;
  skin.push({ key: 'hydration', label: 'Hydration & barrier', level: worst(rank(hydN), has(goals, 'hydrat', 'barrier', 'glass') ? 'monitor' : 'good'), note: hydN ? 'Dryness / barrier support needed' : 'Well hydrated', intensity: hydN });
  const oilN = [skinType === 'oily', has(concerns, 'oily'), has(goals, 'oil control') ? 1 : 0].filter(Boolean).length;
  skin.push({ key: 'oil', label: 'Oil balance', level: skinType === 'oily' ? 'attention' : skinType === 'combination' || oilN ? 'monitor' : 'good', note: skinType === 'oily' ? 'Excess sebum — lightweight, non-comedogenic products' : 'Balanced', intensity: oilN });

  // ---- Hair readings ----
  const hair: Reading[] = [];
  const density = (p.hairDensity ?? 'medium').toLowerCase();
  const fallN = [has(hairC, 'hair fall', 'thinning', 'balding'), density === 'low', has(pf, 'density')].filter(Boolean).length;
  hair.push({ key: 'density', label: 'Hair fall & density', level: worst(rank(fallN), has(hairG, 'growth', 'hair fall', 'volume') ? 'monitor' : 'good'), note: fallN ? 'Shedding / lower density noted' : 'Healthy density', intensity: fallN });
  const thick = (p.hairThickness ?? 'medium').toLowerCase();
  hair.push({ key: 'thickness', label: 'Strand thickness', level: thick === 'fine' ? 'monitor' : 'good', note: thick === 'fine' ? 'Fine strands — volumising, protein care' : 'Medium/thick strands', intensity: thick === 'fine' ? 1 : 0 });
  const scalpN = [['oily', 'dry', 'sensitive'].includes(scalp), has(hairC, 'dandruff', 'oily scalp', 'dry scalp', 'itchy'), has(conds, 'seborrheic'), has(pf, 'scalp')].filter(Boolean).length;
  hair.push({ key: 'scalp', label: 'Scalp health', level: rank(scalpN), note: scalpN ? `${scalp[0].toUpperCase() + scalp.slice(1)} scalp / concerns to manage` : 'Balanced scalp', intensity: scalpN });
  const dmgN = [has(hairC, 'frizz', 'split end', 'breakage', 'colour damage', 'color damage'), ['frizzy', 'dry', 'damaged'].includes((p.hairTexture ?? '').toLowerCase())].filter(Boolean).length;
  hair.push({ key: 'damage', label: 'Frizz & damage', level: rank(dmgN), note: dmgN ? 'Dryness / breakage — repair & seal' : 'Smooth, healthy cuticle', intensity: dmgN });
  const lineN = [has(hairC, 'receding hairline', 'balding'), has(pf, 'hairline')].filter(Boolean).length;
  hair.push({ key: 'hairline', label: 'Hairline', level: rank(lineN * 2), note: lineN ? 'Receding / thinning hairline — see a trichologist if progressing' : 'Stable hairline', intensity: lineN * 2 });

  // ---- Recommendations (allergen & pregnancy aware) ----
  const rec = (name: string) => !avoid(name);
  const skinRec: string[] = [];
  skinRec.push('Gentle pH-balanced cleanser, morning & night');
  if (skinType === 'dry' || has(goals, 'hydrat', 'barrier')) skinRec.push(rec('hyaluronic') ? 'Hyaluronic-acid serum + ceramide moisturiser' : 'Fragrance-free ceramide moisturiser');
  if (has(goals, 'oil control', 'pore') || skinType === 'oily') skinRec.push(!pregnant && rec('salicylic') ? 'Salicylic-acid (BHA) 2% for pores/oil' : 'Clay mask 1–2×/week for oil');
  if (has(goals, 'pigment', 'dark spot', 'even', 'bright', 'glow')) skinRec.push(rec('vitamin c') ? 'Vitamin-C serum (AM)' : rec('niacinamide') ? 'Niacinamide 5% for tone' : 'Azelaic acid for tone');
  if (has(goals, 'ageing', 'aging', 'wrinkle', 'fine line', 'firm')) skinRec.push(!pregnant && rec('retinol') ? 'Retinol at night (start 2×/week)' : pregnant ? 'Bakuchiol (pregnancy-safe retinol alternative)' : 'Peptide serum for firmness');
  if (has(concerns, 'rosacea', 'redness') || skinType === 'sensitive') skinRec.push('Centella / azelaic acid to calm redness; patch-test everything');
  skinRec.push('Broad-spectrum SPF 50 every morning — non-negotiable for tone & ageing');

  const hairRec: string[] = [];
  hairRec.push(rec('sulphate') ? 'Sulphate-free shampoo suited to your scalp' : 'Mild shampoo');
  if (scalpN || has(hairC, 'dandruff')) hairRec.push('Anti-dandruff wash (ketoconazole / zinc pyrithione) 2×/week');
  if (fallN || has(hairG, 'growth', 'hair fall')) hairRec.push('Scalp serum (e.g. peptides/rosemary); see a doctor about minoxidil if progressing');
  if (dmgN || has(hairG, 'repair', 'smooth', 'frizz')) hairRec.push(rec('silicone') ? 'Weekly protein/moisture hair mask + leave-in serum' : 'Weekly moisture mask');
  hairRec.push('Trim split ends every 8–10 weeks; avoid high-heat styling');

  // ---- Cautions ----
  const cautions: string[] = [];
  if (pregnant) cautions.push('Pregnant/breastfeeding: avoid retinoids, high-dose salicylic acid and hydroquinone — safer alternatives suggested above.');
  // Only when it actually happened, and naming what the citizen typed. Silence
  // when a declared sensitivity changed nothing here — an unearned reassurance
  // is the same species of lie as an unearned empty state.
  if (avoidedTerms.size) {
    cautions.push(`Some suggestions were changed because you told us about ${joinTerms([...avoidedTerms].sort())}.`);
  }
  if (has(conds, 'pcos', 'thyroid', 'hormonal acne')) cautions.push('Hormonal factors (PCOS/thyroid) can drive acne & hair fall — topical care helps, but treat the root cause with your doctor.');
  cautions.push('This is an educational assessment, not a dermatological diagnosis. Persistent or worsening issues deserve a certified dermatologist.');

  // ---- Ingredient recommendations (with "why", allergen-aware) ----
  const ING: { name: string; why: string; when: () => boolean }[] = [
    { name: 'Niacinamide', why: 'Evens tone, calms redness and strengthens the barrier — well tolerated by most.', when: () => has(goals, 'even', 'bright', 'redness', 'pore') || has(concerns, 'redness', 'large pore', 'dull') },
    { name: 'Hyaluronic acid', why: 'Draws water into the skin for lasting hydration and a plumper look.', when: () => skinType === 'dry' || has(goals, 'hydrat', 'glass', 'barrier') },
    { name: 'Vitamin C', why: 'Daytime antioxidant that brightens pigmentation and supports collagen.', when: () => has(goals, 'bright', 'pigment', 'dark spot', 'glow', 'even') },
    { name: pregnant ? 'Bakuchiol' : 'Retinol', why: pregnant ? 'A pregnancy-safe retinol alternative for smoothing and firmness.' : 'Gold-standard for fine lines, texture and firmness (build up slowly).', when: () => has(goals, 'ageing', 'aging', 'wrinkle', 'fine line', 'firm') },
    { name: 'Salicylic acid (BHA)', why: 'Oil-soluble exfoliant that clears pores and controls breakouts.', when: () => !pregnant && (skinType === 'oily' || has(goals, 'oil control', 'pore') || has(concerns, 'acne', 'blackhead', 'whitehead')) },
    { name: 'Azelaic acid', why: 'Calms redness and fades post-acne marks — safe in pregnancy.', when: () => has(concerns, 'rosacea', 'redness', 'dark spot') || skinType === 'sensitive' },
    { name: 'Ceramides', why: 'Replenish the lipids a dry or compromised barrier is missing.', when: () => skinType === 'dry' || has(goals, 'barrier') || has(concerns, 'flaky', 'eczema') },
    { name: 'SPF (zinc/broad-spectrum)', why: 'The single most effective step against ageing and pigmentation.', when: () => true },
    { name: 'Ketoconazole / zinc pyrithione', why: 'Targets the yeast behind dandruff and an itchy, flaky scalp.', when: () => has(hairC, 'dandruff', 'itchy', 'oily scalp') || has(conds, 'seborrheic') },
    { name: 'Rosemary / peptide scalp serum', why: 'Supports circulation and follicles where shedding is a concern.', when: () => has(hairC, 'hair fall', 'thinning', 'balding') || has(hairG, 'growth', 'hair fall') },
  ];
  const ingredients: IngredientRec[] = ING.filter((i) => i.when() && !avoid(i.name.split(' ')[0])).map(({ name, why }) => ({ name, why }));

  // ---- AM / PM / weekly routine ----
  const wantsC = has(goals, 'bright', 'pigment', 'dark spot', 'glow', 'even') && rec('vitamin c');
  const wantsRetinoid = has(goals, 'ageing', 'aging', 'wrinkle', 'fine line', 'firm');
  const am: RoutineStep[] = [
    { step: 'Gentle cleanser' },
    ...(wantsC ? [{ step: 'Vitamin-C serum', ingredient: 'Vitamin C' }] : []),
    ...(skinType === 'dry' || has(goals, 'hydrat') ? [{ step: 'Hydrating serum', ingredient: 'Hyaluronic acid' }] : []),
    { step: 'Moisturiser', ingredient: 'Ceramides' },
    { step: 'Sunscreen SPF 50', ingredient: 'Zinc / broad-spectrum' },
  ];
  const pm: RoutineStep[] = [
    { step: 'Cleanser (double-cleanse if wearing SPF/makeup)' },
    ...(wantsRetinoid ? [{ step: pregnant ? 'Bakuchiol serum' : 'Retinol (start 2×/week)', ingredient: pregnant ? 'Bakuchiol' : 'Retinol' }]
      : (skinType === 'oily' || has(concerns, 'acne', 'blackhead')) && rec('salicylic') && !pregnant ? [{ step: 'BHA treatment (alternate nights)', ingredient: 'Salicylic acid' }] : []),
    ...(has(concerns, 'redness', 'rosacea') || skinType === 'sensitive' ? [{ step: 'Soothing serum', ingredient: 'Azelaic acid / Centella' }] : []),
    { step: 'Moisturiser', ingredient: 'Ceramides' },
  ];
  const weekly: RoutineStep[] = [
    ...(skinType !== 'sensitive' && has(goals, 'glow', 'pore', 'even', 'bright') ? [{ step: 'Gentle exfoliation 1–2×/week', ingredient: rec('aha') ? 'AHA' : 'Enzyme' }] : []),
    ...(has(hairC, 'dandruff', 'oily scalp') ? [{ step: 'Anti-dandruff wash 2×/week', ingredient: 'Ketoconazole / ZPT' }] : []),
    { step: 'Hair mask weekly', ingredient: 'Protein + moisture' },
  ];
  const seasonal = skinType === 'dry'
    ? 'Winter: switch to a richer cream and add a hydrating serum layer. Summer: lighter gel-cream but never skip SPF.'
    : skinType === 'oily'
      ? 'Summer: lightweight gel moisturiser, blot excess oil, reapply SPF. Winter: add a hydrating serum so you don\'t over-strip.'
      : 'Summer: lighter textures + diligent SPF and reapplication. Winter: a richer moisturiser and gentler actives as skin can get drier.';

  // ---- Makeup from tone & undertone ----
  const tone = (p.skinTone ?? '').toLowerCase();
  const under = (p.undertone ?? 'neutral').toLowerCase();
  const underNote = under.includes('warm') ? 'golden/yellow undertone — pick "warm/golden/honey" shades'
    : under.includes('cool') ? 'cool/pink undertone — pick "cool/rose/beige" shades'
      : under.includes('neutral') ? 'neutral undertone — most shade families suit you'
        : 'undertone unknown — test 2–3 shades along the jaw in daylight';
  const makeup: MakeupRec[] = [
    { item: 'Foundation / BB cream', note: `${tone ? tone.charAt(0).toUpperCase() + tone.slice(1) + ' depth, ' : ''}${underNote}. ${skinType === 'oily' ? 'Matte, oil-free.' : skinType === 'dry' ? 'Hydrating, dewy finish.' : 'Natural finish.'}` },
    { item: 'Concealer', note: has(concerns, 'dark circle') ? 'Peach/orange corrector under a matching concealer for dark circles.' : 'One shade lighter for brightening the under-eye.' },
    { item: 'Blush', note: under.includes('warm') ? 'Peach / coral / warm terracotta.' : under.includes('cool') ? 'Rose / berry / mauve.' : 'Soft rosy-nude suits most.' },
    { item: 'Lip', note: under.includes('warm') ? 'Brick, coral, warm nude.' : under.includes('cool') ? 'Berry, rose, blue-red.' : 'Your-lips-but-better nudes and true reds.' },
  ];

  const skinIssues = skin.filter((r) => r.level === 'attention' || r.level === 'priority').map((r) => r.label);
  const hairIssues = hair.filter((r) => r.level === 'attention' || r.level === 'priority').map((r) => r.label);
  /**
   * ONE SENTENCE, BUILT FROM TWO NAMED HALVES — and it is the same sentence it
   * has always been. The page sets the first half in display type and the
   * second in italic beneath it, so it needs them apart; everything else still
   * wants the paragraph. Composing the paragraph FROM the halves rather than
   * splitting it back out is what keeps the two from ever disagreeing.
   */
  const focus = focusOf({ skin: { issues: skinIssues }, hair: { issues: hairIssues } });
  const lead = focus.length
    ? `Your assessment flags ${focus.join(', ')} as the priorities.`
    : 'Your skin and hair look well-balanced from your profile.';
  const note = focus.length
    ? `The routine below targets these while respecting your skin type${allergies.length ? ' and sensitivities' : ''}.`
    : 'The routine below is a gentle maintenance plan to keep it that way.';
  const summary = `${lead} ${note}`;

  return {
    summary,
    focus,
    note,
    skin: { readings: skin, issues: skinIssues, recommendations: skinRec },
    hair: { readings: hair, issues: hairIssues, recommendations: hairRec },
    ingredients,
    routine: { am, pm, weekly, seasonal },
    makeup,
    cautions,
  };
}
