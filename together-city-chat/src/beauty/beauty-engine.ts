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
  category: string;         // display category
  priceInr: number;
  tags: BeautyTag[];        // needs it addresses
  blurb: string;
  keyIngredient: string;
}

/** Curated, science-led shelf. Tags connect each product to insights & concerns. */
export const BEAUTY_PRODUCTS: BeautyProduct[] = [
  { id: 'bp_barrier', name: 'Ceramide Barrier Cream', category: 'Moisturiser', priceInr: 1290, tags: ['barrier', 'hydration'], keyIngredient: 'Ceramides + cholesterol', blurb: 'Rebuilds a stressed skin barrier; the anchor for dry, reactive skin.' },
  { id: 'bp_hydra', name: 'Hyaluronic Hydra Serum', category: 'Serum', priceInr: 990, tags: ['hydration'], keyIngredient: 'Multi-weight hyaluronic acid', blurb: 'Layered water-binding hydration under moisturiser.' },
  { id: 'bp_vitc', name: 'Vitamin C 15% Serum', category: 'Serum', priceInr: 1490, tags: ['antioxidant', 'brightening'], keyIngredient: 'L-ascorbic acid 15%', blurb: 'Daytime antioxidant that brightens tone and supports collagen.' },
  { id: 'bp_niac', name: 'Niacinamide 10% + Zinc', category: 'Serum', priceInr: 850, tags: ['brightening', 'soothing', 'barrier'], keyIngredient: 'Niacinamide 10%', blurb: 'Evens tone, calms redness and reinforces the barrier.' },
  { id: 'bp_spf', name: 'Mineral SPF 50 Fluid', category: 'Sunscreen', priceInr: 1150, tags: ['spf'], keyIngredient: 'Zinc oxide', blurb: 'Daily broad-spectrum defence; stops pigment deepening.' },
  { id: 'bp_retinal', name: 'Retinal 0.05% Night', category: 'Treatment', priceInr: 1690, tags: ['collagen', 'antioxidant'], keyIngredient: 'Retinaldehyde', blurb: 'Nightly collagen-support retinoid for firmness and renewal.' },
  { id: 'bp_peptide', name: 'Peptide Collagen Boost', category: 'Serum', priceInr: 1590, tags: ['collagen'], keyIngredient: 'Signal peptides', blurb: 'Peptide complex to support firmness where glycation is a concern.' },
  { id: 'bp_scalp', name: 'Scalp Density Serum', category: 'Haircare', priceInr: 1390, tags: ['scalp', 'hair-density'], keyIngredient: 'Caffeine + copper peptides', blurb: 'Supports the hair you have while iron stores recover.' },
  { id: 'bp_centella', name: 'Centella Soothing Gel', category: 'Treatment', priceInr: 950, tags: ['soothing', 'barrier'], keyIngredient: 'Centella asiatica', blurb: 'Calms reactive, inflammation-prone skin.' },
  { id: 'bp_cleanser', name: 'Gentle Amino Cleanser', category: 'Cleanser', priceInr: 690, tags: ['barrier'], keyIngredient: 'Amino-acid surfactants', blurb: 'A low-strip daily cleanser that respects the barrier.' },
];

/** Concern keys the user can set in their Beauty profile → the tags they map to. */
export const CONCERN_TAGS: Record<string, { label: string; tags: BeautyTag[] }> = {
  dryness: { label: 'Dryness', tags: ['barrier', 'hydration'] },
  dullness: { label: 'Dullness', tags: ['brightening', 'antioxidant'] },
  acne: { label: 'Breakouts', tags: ['soothing'] },
  aging: { label: 'Fine lines', tags: ['collagen', 'antioxidant'] },
  pigmentation: { label: 'Dark spots', tags: ['brightening', 'spf'] },
  sensitivity: { label: 'Sensitivity', tags: ['soothing', 'barrier'] },
  hairLoss: { label: 'Hair thinning', tags: ['scalp', 'hair-density'] },
};

export interface RecommendedProduct extends BeautyProduct {
  matched: boolean;
  reasons: string[];        // why it's recommended (insight concern / profile concern)
}

/**
 * Rank the shelf for a user: a product is "matched" when its tags overlap the
 * tags demanded by their biomarker insights and/or their stated concerns.
 * Matched products come first, most-relevant first, each with human reasons.
 */
export function recommendProducts(
  insights: BeautyInsight[],
  concerns: string[],
): RecommendedProduct[] {
  const insightTag = new Map<BeautyTag, string>();          // tag → concern label (from labs)
  for (const ins of insights) for (const t of ins.tags) if (!insightTag.has(t)) insightTag.set(t, ins.concern);

  const concernTag = new Map<BeautyTag, string>();          // tag → concern label (from profile)
  for (const c of concerns) {
    const def = CONCERN_TAGS[c];
    if (def) for (const t of def.tags) if (!concernTag.has(t)) concernTag.set(t, def.label);
  }

  const scored = BEAUTY_PRODUCTS.map((p) => {
    const reasons: string[] = [];
    let score = 0;
    for (const t of p.tags) {
      if (insightTag.has(t)) { score += 3; reasons.push(`From your labs: ${insightTag.get(t)}`); }
      else if (concernTag.has(t)) { score += 1; reasons.push(`Your concern: ${concernTag.get(t)}`); }
    }
    // de-duplicate reasons, keep order
    const seen = new Set<string>();
    const uniqueReasons = reasons.filter((r) => (seen.has(r) ? false : seen.add(r)));
    return { ...p, matched: score > 0, reasons: uniqueReasons, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ _score, ...p }) => p);
}
