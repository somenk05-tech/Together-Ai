/**
 * Together City — Beauty Engine
 * ------------------------------------------------------------------
 * Translates the SAME cited clinical blood panel that the Medical Hub owns into
 * evidence-based skin & hair insights, and matches consumer beauty products to
 * them. This is the Beauty side of the cross-hub consent architecture: the
 * Medical Hub is the source of truth for biomarkers; Beauty may read them only
 * while the user's consent for the Beauty hub is granted (enforced server-side).
 *
 * Every insight is traceable to a source: micronutrient roles from the ESPEN
 * micronutrient guideline and NIH Office of Dietary Supplements, and the
 * nutrition-focused physical findings (skin, hair, nails) from Krause's Food &
 * the Nutrition Care Process (Ch.7 Nutrition-Focused Physical Assessment).
 *
 * This is educational skincare/haircare guidance grounded in nutrition science —
 * NOT a dermatological diagnosis. Deficiency signs can have many causes; persistent
 * skin/hair changes should be reviewed by a clinician.
 */

import { CITATIONS, flagsFor, type Citation, type MarkerStatus } from '../nutrition/clinical-engine';

const cite = (ids: string[]): Citation[] => ids.map((id) => CITATIONS[id]).filter(Boolean);

/** Beauty "need" categories — the vocabulary that links insights to products. */
export type BeautyTag =
  | 'barrier' | 'hydration' | 'brightening' | 'antioxidant'
  | 'collagen' | 'soothing' | 'spf' | 'scalp' | 'hair-density';

export interface SkinHairRule {
  marker: string;                 // biomarker key from the shared panel
  when: MarkerStatus;             // fires on 'low' or 'high'
  concern: string;                // the visible skin/hair concern
  mechanism: string;              // why the biomarker links to it (cited)
  advice: string;                 // what to do (nutrition + topical direction)
  tags: BeautyTag[];              // product categories that address it
  citations: string[];
}

/**
 * Biomarker → skin/hair rules. Nutrition mechanisms are cited to ESPEN-MN / NIH-ODS;
 * the visible deficiency signs (koilonychia, glossitis, hyperpigmentation, xerosis,
 * telogen effluvium association) are documented in Krause Ch.7 physical assessment.
 */
export const SKIN_HAIR_RULES: SkinHairRule[] = [
  {
    marker: 'ferritin', when: 'low',
    concern: 'Hair thinning & increased shedding',
    mechanism: 'Low iron stores are a recognised nutritional contributor to diffuse hair shedding (telogen effluvium) and to brittle, spoon-shaped nails (koilonychia) on nutrition-focused physical exam.',
    advice: 'Rebuild iron stores first — heme iron (lean meat, liver, fish) and iron-rich plants paired with a vitamin-C source. Topically, a peptide/caffeine scalp-density serum supports the hair you have while stores recover over 3–6 months.',
    tags: ['scalp', 'hair-density'],
    citations: ['ESPEN-MN', 'KRAUSE', 'NIH-ODS'],
  },
  {
    marker: 'hb', when: 'low',
    concern: 'Pallor & lacklustre skin',
    mechanism: 'Anaemia reduces oxygen delivery to skin, showing as pallor and dullness; it commonly accompanies the iron-related hair and nail changes above.',
    advice: 'Address the underlying anaemia (see your Medical panel). A gentle hydrating routine and colour-correcting vitamin-C brightening step improve the look of tone while iron is restored.',
    tags: ['brightening', 'hydration'],
    citations: ['KRAUSE', 'ESPEN-MN'],
  },
  {
    marker: 'vitd', when: 'low',
    concern: 'Dry, barrier-stressed skin',
    mechanism: 'Vitamin D participates in keratinocyte differentiation and skin-barrier function; low status is associated with drier, more reactive skin and is studied in hair-cycle regulation.',
    advice: 'Correct vitamin D (sensible sun, fatty fish, fortified foods, a D3 supplement if advised — aim 30–60 ng/mL). Topically, layer a ceramide barrier moisturiser over a hyaluronic serum to rebuild the barrier.',
    tags: ['barrier', 'hydration'],
    citations: ['ESPEN-MN', 'NIH-ODS'],
  },
  {
    marker: 'b12', when: 'low',
    concern: 'Uneven tone & hyperpigmentation',
    mechanism: 'B12 deficiency can cause cutaneous hyperpigmentation and angular cheilitis/glossitis (documented physical signs), reflecting its role in cell turnover.',
    advice: 'Restore B12 (animal foods, or a supplement if plant-based/on metformin). Topically, niacinamide plus a vitamin-C step evens tone, and daily SPF prevents pigment from deepening.',
    tags: ['brightening', 'spf'],
    citations: ['ESPEN-MN', 'KRAUSE', 'NIH-ODS'],
  },
  {
    marker: 'folate', when: 'low',
    concern: 'Dull tone & slow renewal',
    mechanism: 'Folate is required for the rapid cell division of skin and hair follicles; low folate (checked alongside B12) can show as a tired, uneven complexion.',
    advice: 'Favour fresh dark-green vegetables, legumes and citrus (heat destroys folate). Topically, a gentle antioxidant + brightening routine supports renewal.',
    tags: ['antioxidant', 'brightening'],
    citations: ['ESPEN-MN', 'KRAUSE', 'NIH-ODS'],
  },
  {
    marker: 'hba1c', when: 'high',
    concern: 'Glycation & loss of firmness',
    mechanism: 'Sustained high glucose drives glycation of dermal collagen (advanced glycation end-products), stiffening it and slowing skin repair — visible as reduced elasticity.',
    advice: 'Lowering glycemic load (your Nutrition plan already leans this way) is the upstream fix. Topically, a stabilised vitamin-C antioxidant by day and a retinal at night support collagen quality.',
    tags: ['antioxidant', 'collagen'],
    citations: ['LABREF', 'KRAUSE'],
  },
  {
    marker: 'crp', when: 'high',
    concern: 'Reactive, inflammation-prone skin',
    mechanism: 'Raised systemic inflammation (CRP) is associated with more reactive skin — redness, sensitivity and breakouts can flare, and the skin barrier is more easily disrupted.',
    advice: 'An anti-inflammatory Mediterranean pattern helps from within. While flaring, simplify to fragrance-free, soothing actives (niacinamide, centella) and pause harsh exfoliants until skin calms.',
    tags: ['soothing', 'barrier'],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
];

export interface BeautyInsight {
  marker: string;
  status: MarkerStatus;
  value: number;
  concern: string;
  mechanism: string;
  advice: string;
  tags: BeautyTag[];
  citations: Citation[];
}

/** Derive skin/hair insights from a shared biomarker panel. */
export function beautyInsights(values: Record<string, number>): BeautyInsight[] {
  const flags = flagsFor(values);
  const out: BeautyInsight[] = [];
  for (const rule of SKIN_HAIR_RULES) {
    if (flags[rule.marker] === rule.when) {
      out.push({
        marker: rule.marker, status: rule.when, value: values[rule.marker],
        concern: rule.concern, mechanism: rule.mechanism, advice: rule.advice,
        tags: rule.tags, citations: cite(rule.citations),
      });
    }
  }
  return out;
}

// ─────────────────────────── product market ───────────────────────────
export interface BeautyProduct {
  id: string;
  name: string;
  brand: string;
  category: string;         // display category
  priceInr: number;
  tags: BeautyTag[];        // biomarker-insight needs it addresses (secondary signal)
  profileKeys: string[];    // assessment reading keys it addresses (PRIMARY signal)
  suitableSkin: string[];   // skin types it suits ('all' | dry/oily/combination/normal/sensitive)
  actives: string[];        // key active ingredients
  usage: string;            // Morning | Night | Morning & Night | Weekly
  blurb: string;
  keyIngredient: string;
}

/** Curated, science-led shelf. profileKeys drive matching; tags refine via labs. */
export const BEAUTY_PRODUCTS: BeautyProduct[] = [
  { id: 'bp_barrier', name: 'Ceramide Barrier Cream', brand: 'Together Beauty Labs', category: 'Moisturiser', priceInr: 1290, tags: ['barrier', 'hydration'], profileKeys: ['hydration', 'redness'], suitableSkin: ['dry', 'sensitive', 'normal', 'combination'], actives: ['Ceramides', 'Cholesterol', 'Fatty acids'], usage: 'Morning & Night', keyIngredient: 'Ceramides + cholesterol', blurb: 'Rebuilds a stressed skin barrier; the anchor for dry, reactive skin.' },
  { id: 'bp_hydra', name: 'Hyaluronic Hydra Serum', brand: 'Together Beauty Labs', category: 'Serum', priceInr: 990, tags: ['hydration'], profileKeys: ['hydration'], suitableSkin: ['all'], actives: ['Multi-weight hyaluronic acid', 'Panthenol'], usage: 'Morning & Night', keyIngredient: 'Multi-weight hyaluronic acid', blurb: 'Layered water-binding hydration under moisturiser.' },
  { id: 'bp_vitc', name: 'Vitamin C 15% Serum', brand: 'Together Beauty Labs', category: 'Serum', priceInr: 1490, tags: ['antioxidant', 'brightening'], profileKeys: ['pigmentation', 'wrinkles'], suitableSkin: ['normal', 'combination', 'oily', 'dry'], actives: ['L-ascorbic acid 15%', 'Vitamin E', 'Ferulic acid'], usage: 'Morning', keyIngredient: 'L-ascorbic acid 15%', blurb: 'Daytime antioxidant that brightens tone and supports collagen.' },
  { id: 'bp_niac', name: 'Niacinamide 10% + Zinc', brand: 'Together Beauty Labs', category: 'Serum', priceInr: 850, tags: ['brightening', 'soothing', 'barrier'], profileKeys: ['acne', 'oil', 'redness', 'pigmentation'], suitableSkin: ['oily', 'combination', 'sensitive', 'normal'], actives: ['Niacinamide 10%', 'Zinc PCA'], usage: 'Morning & Night', keyIngredient: 'Niacinamide 10%', blurb: 'Evens tone, calms redness, controls oil and reinforces the barrier.' },
  { id: 'bp_spf', name: 'Mineral SPF 50 Fluid', brand: 'Together Beauty Labs', category: 'Sunscreen', priceInr: 1150, tags: ['spf'], profileKeys: ['pigmentation', 'wrinkles', 'redness'], suitableSkin: ['all'], actives: ['Zinc oxide 22%'], usage: 'Morning', keyIngredient: 'Zinc oxide', blurb: 'Daily broad-spectrum defence; stops pigment deepening.' },
  { id: 'bp_retinal', name: 'Retinal 0.05% Night', brand: 'Together Beauty Labs', category: 'Treatment', priceInr: 1690, tags: ['collagen', 'antioxidant'], profileKeys: ['wrinkles', 'texture', 'acne'], suitableSkin: ['normal', 'combination', 'oily', 'dry'], actives: ['Retinaldehyde 0.05%', 'Squalane'], usage: 'Night', keyIngredient: 'Retinaldehyde', blurb: 'Nightly collagen-support retinoid for firmness and renewal.' },
  { id: 'bp_peptide', name: 'Peptide Collagen Boost', brand: 'Together Beauty Labs', category: 'Serum', priceInr: 1590, tags: ['collagen'], profileKeys: ['wrinkles'], suitableSkin: ['all'], actives: ['Matrixyl 3000', 'Copper peptides'], usage: 'Morning & Night', keyIngredient: 'Signal peptides', blurb: 'Peptide complex to support firmness where glycation is a concern.' },
  { id: 'bp_centella', name: 'Centella Soothing Gel', brand: 'Together Beauty Labs', category: 'Treatment', priceInr: 950, tags: ['soothing', 'barrier'], profileKeys: ['redness', 'acne'], suitableSkin: ['sensitive', 'oily', 'combination', 'normal'], actives: ['Centella asiatica', 'Madecassoside'], usage: 'Morning & Night', keyIngredient: 'Centella asiatica', blurb: 'Calms reactive, inflammation-prone skin.' },
  { id: 'bp_cleanser', name: 'Gentle Amino Cleanser', brand: 'Together Beauty Labs', category: 'Cleanser', priceInr: 690, tags: ['barrier'], profileKeys: ['hydration', 'redness', 'oil'], suitableSkin: ['all'], actives: ['Amino-acid surfactants', 'Glycerin'], usage: 'Morning & Night', keyIngredient: 'Amino-acid surfactants', blurb: 'A low-strip daily cleanser that respects the barrier.' },
  { id: 'bp_scalp', name: 'Scalp Density Serum', brand: 'Together Beauty Labs', category: 'Haircare', priceInr: 1390, tags: ['scalp', 'hair-density'], profileKeys: ['density', 'hairline'], suitableSkin: ['all'], actives: ['Caffeine', 'Copper peptides', 'Redensyl'], usage: 'Night', keyIngredient: 'Caffeine + copper peptides', blurb: 'Supports density and the hairline — daily leave-in scalp serum.' },
  { id: 'bp_bond', name: 'Bond Repair Mask', brand: 'Together Beauty Labs', category: 'Haircare', priceInr: 1190, tags: ['scalp'], profileKeys: ['damage', 'thickness'], suitableSkin: ['all'], actives: ['Bond-building complex', 'Hydrolysed keratin'], usage: 'Weekly', keyIngredient: 'Bond-building complex', blurb: 'Rebuilds broken bonds in frizzy, damaged or colour-treated hair.' },
  { id: 'bp_scalptonic', name: 'Balancing Scalp Tonic', brand: 'Together Beauty Labs', category: 'Haircare', priceInr: 890, tags: ['scalp'], profileKeys: ['scalp'], suitableSkin: ['all'], actives: ['Piroctone olamine', 'Salicylic acid', 'Niacinamide'], usage: 'Morning & Night', keyIngredient: 'Piroctone olamine', blurb: 'Settles flaking, itch and oil at the root of scalp trouble.' },
  { id: 'bp_protein', name: 'Volumising Protein Shampoo', brand: 'Together Beauty Labs', category: 'Haircare', priceInr: 790, tags: ['scalp', 'hair-density'], profileKeys: ['thickness', 'density'], suitableSkin: ['all'], actives: ['Hydrolysed rice protein', 'Biotin'], usage: 'Morning', keyIngredient: 'Hydrolysed rice protein', blurb: 'Body and strength for fine or thinning strands.' },
];

/** Legacy quick-concern keys → the assessment reading keys they imply. */
export const CONCERN_TAGS: Record<string, { label: string; tags: BeautyTag[]; keys: string[] }> = {
  dryness: { label: 'Dryness', tags: ['barrier', 'hydration'], keys: ['hydration'] },
  dullness: { label: 'Dullness', tags: ['brightening', 'antioxidant'], keys: ['pigmentation', 'texture'] },
  acne: { label: 'Breakouts', tags: ['soothing'], keys: ['acne'] },
  aging: { label: 'Fine lines', tags: ['collagen', 'antioxidant'], keys: ['wrinkles'] },
  pigmentation: { label: 'Dark spots', tags: ['brightening', 'spf'], keys: ['pigmentation'] },
  sensitivity: { label: 'Sensitivity', tags: ['soothing', 'barrier'], keys: ['redness'] },
  hairLoss: { label: 'Hair thinning', tags: ['scalp', 'hair-density'], keys: ['density'] },
};

/** Friendly biomarker labels for the secondary-optimisation chips. */
const MARKER_CHIP: Record<string, string> = {
  ferritin: 'Low ferritin', hb: 'Low hemoglobin', vitd: 'Low vitamin D', b12: 'Low vitamin B12',
  folate: 'Low folate', hba1c: 'Elevated HbA1c', crp: 'Elevated CRP',
};

export interface RecommendedProduct extends BeautyProduct {
  matched: boolean;
  matchScore: number;            // 0–100 AI match score
  primaryReasons: string[];      // from the skin & hair assessment (PRIMARY)
  biomarkerReasons: string[];    // secondary optimisation chips ("Elevated HbA1c (glycation)")
  explanation: string;           // the "Why was this recommended?" text
  reasons: string[];             // legacy combined list (kept for older clients)
}

export interface ReadingLite { key: string; label: string; level: string }
const SEV: Record<string, number> = { priority: 1, attention: 0.85, monitor: 0.6, good: 0 };

/**
 * Profile-first ranking. Weighting: ~85% the skin & hair assessment (AI photo
 * analysis + onboarding profile), ~10% biomarker optimisation, ~5% preferences
 * (budget, allergies). A product is NEVER recommended on biomarkers alone — if
 * nothing in the user's skin/hair assessment calls for it, lab signals add zero.
 */
export function recommendProducts(opts: {
  readings: ReadingLite[];
  concerns: string[];
  profile: { skinType?: string; budget?: string; allergies?: string[] };
  insights: BeautyInsight[];
}): RecommendedProduct[] {
  const { readings, concerns, profile, insights } = opts;
  const skinType = (profile.skinType ?? 'normal').toLowerCase();
  const allergies = (profile.allergies ?? []).map((a) => a.toLowerCase()).filter(Boolean);

  // Primary signal: assessment readings with an active (non-good) level.
  const need = new Map<string, ReadingLite>();
  for (const r of readings) if ((SEV[r.level] ?? 0) > 0) need.set(r.key, r);
  // Fallback for users without an assessment yet: derive needs from quick concerns.
  if (need.size === 0) {
    for (const c of concerns) {
      const def = CONCERN_TAGS[c];
      if (def) for (const k of def.keys) if (!need.has(k)) need.set(k, { key: k, label: def.label, level: 'attention' });
    }
  }

  // Secondary signal: biomarker insights, indexed by the product tags they demand.
  const bioByTag = new Map<BeautyTag, BeautyInsight>();
  for (const ins of insights) for (const t of ins.tags) if (!bioByTag.has(t)) bioByTag.set(t, ins);

  // Budget band from the profile ("₹1000–2500", "Under ₹500", "₹5000+").
  const budgetMax = (() => {
    const b = profile.budget ?? '';
    const nums = (b.match(/\d+/g) ?? []).map(Number);
    if (!nums.length) return null;
    return b.includes('+') ? Infinity : Math.max(...nums);
  })();

  const scored = BEAUTY_PRODUCTS
    // Hard filter: never surface something the user is allergic/sensitive to.
    .filter((p) => !allergies.some((a) => p.actives.some((ing) => ing.toLowerCase().includes(a)) || p.keyIngredient.toLowerCase().includes(a)))
    .map((p) => {
      const matchedAttrs = p.profileKeys.map((k) => need.get(k)).filter(Boolean) as ReadingLite[];
      const suitable = p.suitableSkin.includes('all') || p.suitableSkin.includes(skinType);

      // 85% — skin & hair profile
      let profilePart = 0;
      if (matchedAttrs.length > 0 && suitable) {
        const best = Math.max(...matchedAttrs.map((r) => SEV[r.level] ?? 0.6));
        const breadth = Math.min(2, matchedAttrs.length - 1) * 0.08;
        profilePart = 0.85 * Math.min(1, best + breadth + 0.05);
      }

      // 10% — biomarker optimisation (only ever ON TOP of a profile match)
      const bioHits = profilePart > 0 ? [...new Set(p.tags.map((t) => bioByTag.get(t)).filter(Boolean))] as BeautyInsight[] : [];
      const bioPart = 0.10 * Math.min(1, bioHits.length * 0.6);

      // 5% — preferences
      let prefPart = 0.02; // baseline for having a profile at all
      if (budgetMax != null) prefPart += p.priceInr <= budgetMax ? 0.03 : -0.01;
      prefPart = Math.max(0, Math.min(0.05, prefPart));

      const matched = profilePart > 0;
      const matchScore = Math.round(100 * Math.min(1, profilePart + bioPart + (matched ? prefPart : 0)));

      const primaryReasons = [
        ...matchedAttrs.map((r) => r.label),
        ...(matched && !p.suitableSkin.includes('all') ? [`Suits ${skinType} skin`] : []),
      ];
      const biomarkerReasons = bioHits.map((i) => `${MARKER_CHIP[i.marker] ?? i.marker} (${i.concern.toLowerCase()})`);

      const explanation = matched
        ? `We recommended ${p.name} primarily because your skin & hair assessment shows ${matchedAttrs.map((r) => r.label.toLowerCase()).join(', ') || 'a matching need'}.`
          + (bioHits.length ? ` Your blood panel adds a supporting signal — ${bioHits.map((i) => `${MARKER_CHIP[i.marker] ?? i.marker} is associated with ${i.concern.toLowerCase()}`).join('; ')} — so this pick was prioritised.` : '')
          + ` It contains ${p.actives.slice(0, 3).join(', ')} to address exactly this. Use: ${p.usage.toLowerCase()}.`
        : `${p.name} is general care — nothing in your current assessment specifically calls for it.`;

      return {
        ...p, matched, matchScore,
        primaryReasons, biomarkerReasons, explanation,
        reasons: [...primaryReasons.map((r) => `Your skin & hair: ${r}`), ...biomarkerReasons.map((r) => `Labs: ${r}`)],
      };
    });

  scored.sort((a, b) => b.matchScore - a.matchScore || a.priceInr - b.priceInr);
  return scored;
}
