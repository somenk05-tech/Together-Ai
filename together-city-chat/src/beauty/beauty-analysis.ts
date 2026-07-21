// Deterministic skin & hair assessment. Generated ONCE when the user saves their
// profile (or uploads photos) and then cached — no per-open AI. Turns the stated
// profile + concerns + any photo findings into per-attribute readings, the top
// issues, and a routine tuned to their goals, allergies and medical conditions.

export type Level = 'good' | 'monitor' | 'attention' | 'priority';
export interface Reading { key: string; label: string; level: Level; note: string }
export interface RoutineStep { step: string; ingredient?: string }
export interface IngredientRec { name: string; why: string }
export interface MakeupRec { item: string; note: string }
export interface BeautyAssessment {
  summary: string;
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
  const avoid = (name: string) => allergies.some((a) => name.toLowerCase().includes(a) || a.includes(name.toLowerCase()));

  // ---- Skin readings ----
  const skin: Reading[] = [];
  const acneN = [has(concerns, 'acne', 'pimple'), has(concerns, 'whitehead', 'blackhead'), has(conds, 'hormonal acne', 'pcos', 'seborrheic'), has(pf, 'acne')].filter(Boolean).length;
  skin.push({ key: 'acne', label: 'Acne & breakouts', level: worst(rank(acneN), has(goals, 'acne') ? 'monitor' : 'good'), note: acneN ? 'Active breakouts or acne history noted' : 'No active acne reported' });
  const pigN = [has(concerns, 'dark spot', 'hyperpig', 'melasma'), has(concerns, 'tan', 'sun damage'), has(pf, 'pigment')].filter(Boolean).length;
  skin.push({ key: 'pigmentation', label: 'Pigmentation & spots', level: worst(rank(pigN), has(goals, 'pigment', 'dark spot', 'tan', 'even') ? 'monitor' : 'good'), note: pigN ? 'Uneven tone / dark spots to address' : 'Even tone' });
  const wrinkleN = [has(concerns, 'fine line', 'wrinkle'), age >= 40, has(pf, 'wrinkle')].filter(Boolean).length;
  skin.push({ key: 'wrinkles', label: 'Fine lines & firmness', level: worst(rank(wrinkleN), has(goals, 'ageing', 'aging', 'wrinkle', 'fine line', 'firm') ? 'monitor' : 'good'), note: wrinkleN ? 'Early lines / loss of firmness' : 'Firm, few lines' });
  const texN = [has(concerns, 'uneven texture', 'large pore'), has(pf, 'texture', 'pore')].filter(Boolean).length;
  skin.push({ key: 'texture', label: 'Texture & pores', level: worst(rank(texN), has(goals, 'pore', 'glass', 'glow') ? 'monitor' : 'good'), note: texN ? 'Rough texture / visible pores' : 'Smooth texture' });
  const redN = [has(concerns, 'rosacea', 'redness'), skinType === 'sensitive', has(conds, 'rosacea', 'eczema', 'psoriasis'), has(pf, 'redness')].filter(Boolean).length;
  skin.push({ key: 'redness', label: 'Redness & sensitivity', level: rank(redN), note: redN ? 'Reactive / inflamed skin — patch-test new actives' : 'Calm, non-reactive' });
  const hydN = [has(concerns, 'dry', 'flaky', 'dull'), skinType === 'dry', has(pf, 'dehydrat', 'dry')].filter(Boolean).length;
  skin.push({ key: 'hydration', label: 'Hydration & barrier', level: worst(rank(hydN), has(goals, 'hydrat', 'barrier', 'glass') ? 'monitor' : 'good'), note: hydN ? 'Dryness / barrier support needed' : 'Well hydrated' });
  const oilN = [skinType === 'oily', has(concerns, 'oily'), has(goals, 'oil control') ? 1 : 0].filter(Boolean).length;
  skin.push({ key: 'oil', label: 'Oil balance', level: skinType === 'oily' ? 'attention' : skinType === 'combination' || oilN ? 'monitor' : 'good', note: skinType === 'oily' ? 'Excess sebum — lightweight, non-comedogenic products' : 'Balanced' });

  // ---- Hair readings ----
  const hair: Reading[] = [];
  const density = (p.hairDensity ?? 'medium').toLowerCase();
  const fallN = [has(hairC, 'hair fall', 'thinning', 'balding'), density === 'low', has(pf, 'density')].filter(Boolean).length;
  hair.push({ key: 'density', label: 'Hair fall & density', level: worst(rank(fallN), has(hairG, 'growth', 'hair fall', 'volume') ? 'monitor' : 'good'), note: fallN ? 'Shedding / lower density noted' : 'Healthy density' });
  const thick = (p.hairThickness ?? 'medium').toLowerCase();
  hair.push({ key: 'thickness', label: 'Strand thickness', level: thick === 'fine' ? 'monitor' : 'good', note: thick === 'fine' ? 'Fine strands — volumising, protein care' : 'Medium/thick strands' });
  const scalpN = [['oily', 'dry', 'sensitive'].includes(scalp), has(hairC, 'dandruff', 'oily scalp', 'dry scalp', 'itchy'), has(conds, 'seborrheic'), has(pf, 'scalp')].filter(Boolean).length;
  hair.push({ key: 'scalp', label: 'Scalp health', level: rank(scalpN), note: scalpN ? `${scalp[0].toUpperCase() + scalp.slice(1)} scalp / concerns to manage` : 'Balanced scalp' });
  const dmgN = [has(hairC, 'frizz', 'split end', 'breakage', 'colour damage', 'color damage'), ['frizzy', 'dry', 'damaged'].includes((p.hairTexture ?? '').toLowerCase())].filter(Boolean).length;
  hair.push({ key: 'damage', label: 'Frizz & damage', level: rank(dmgN), note: dmgN ? 'Dryness / breakage — repair & seal' : 'Smooth, healthy cuticle' });
  const lineN = [has(hairC, 'receding hairline', 'balding'), has(pf, 'hairline')].filter(Boolean).length;
  hair.push({ key: 'hairline', label: 'Hairline', level: rank(lineN * 2), note: lineN ? 'Receding / thinning hairline — see a trichologist if progressing' : 'Stable hairline' });

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
  if (allergies.length) cautions.push(`Avoiding your flagged sensitivities: ${(p.allergies ?? []).join(', ')}.`);
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
  const focus = [...skinIssues, ...hairIssues].slice(0, 3);
  const summary = focus.length
    ? `Your assessment flags ${focus.join(', ')} as the priorities. The routine below targets these while respecting your skin type${allergies.length ? ' and sensitivities' : ''}.`
    : 'Your skin and hair look well-balanced from your profile. The routine below is a gentle maintenance plan to keep it that way.';

  return {
    summary,
    skin: { readings: skin, issues: skinIssues, recommendations: skinRec },
    hair: { readings: hair, issues: hairIssues, recommendations: hairRec },
    ingredients,
    routine: { am, pm, weekly, seasonal },
    makeup,
    cautions,
  };
}
