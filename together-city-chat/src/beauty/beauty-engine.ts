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
import { isTopicallySafe } from '../shared/topical-sensitivities';
import { claimableKeys, type ProductSite } from './product-site';
import { conditionsDeclared, isSafeForConditions } from '../shared/topical-contraindications';

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
// The shelf itself lives in beauty-catalog.ts — seventy real products,
// generated from the owner's data sheet. It is imported and re-exported here
// because every reader in the hub has always taken BEAUTY_PRODUCTS from this
// file, and moving the data should not move the door.
import { BEAUTY_PRODUCTS } from './beauty-catalog';
export { BEAUTY_PRODUCTS };
export interface BeautyProduct {
  id: string;
  name: string;
  brand: string;
  category: string;         // display category
  /** 'Skincare' | 'Hair Care' | 'Body Care' — which band of the routine it is in. */
  group: string;
  /**
   * WHERE ON THE BODY IT ACTS, when that is not what the group implies.
   *
   * Omitted on almost every row: absence means the group's default, resolved in
   * one place by `siteOf()` in product-site.ts. It is present on the facial-hair
   * products inside Hair Care, which is what stops a beard growth oil answering
   * a reading about the hair on someone's head. See product-site.ts for what
   * went wrong before this field existed.
   */
  site?: ProductSite;
  priceInr: number;
  /** 'Budget' | 'Mid-range' | 'Premium', as the data sheet grades it. */
  tier: string;
  tags: BeautyTag[];        // biomarker-insight needs it addresses (secondary signal)
  profileKeys: string[];    // assessment reading keys it addresses (PRIMARY signal)
  suitableSkin: string[];   // skin types it suits ('all' | dry/oily/combination/normal/sensitive)
  actives: string[];        // key active ingredients
  usage: string;            // Morning | Night | Morning & Night | Weekly | Body
  blurb: string;
  keyIngredient: string;
  /** The retailer's own photograph, and a second from another retailer. Both
   *  hotlinked, so both may fail; the screens fall through to a mark. */
  image: string;
  imageAlt: string;
  /** Where it is actually sold. */
  productUrl: string;
}


/** Legacy quick-concern keys → the assessment reading keys they imply. */
export interface RequestedLine { id: string; qty: number }
export interface PricedLine { id: string; name: string; priceInr: number; qty: number }
export type BeautyOrderPricing =
  | { ok: true; lines: PricedLine[]; totalInr: number }
  | { ok: false; unknownIds: string[] };

/**
 * What a beauty order costs, decided here rather than by whoever asked for it.
 *
 * The order endpoint used to take `priceInr` from the request body and charge
 * the city wallet the sum of what was posted. Every other paid endpoint in the
 * app — restaurant dishes, event tiers, consult fees, travel packages, tarot
 * spreads, the grocery cart — reads its price out of the row or the rate table
 * first. This one trusted the caller, so a request naming a ₹1,690 retinal at
 * ₹1 would have been charged ₹1 and recorded a legitimate-looking order.
 *
 * So the client now says only WHAT and HOW MANY. An id that is not on the shelf
 * is refused rather than silently dropped, because a citizen who thinks they
 * ordered five things should not be charged for four. Two lines naming the same
 * product are one line for twice as much, so quantity caps cannot be walked
 * around by repeating an id.
 */
export function priceBeautyOrder(requested: RequestedLine[]): BeautyOrderPricing {
  const byId = new Map(BEAUTY_PRODUCTS.map((p) => [p.id, p]));
  const unknownIds = [...new Set(requested.map((r) => r.id).filter((id) => !byId.has(id)))];
  if (unknownIds.length > 0) return { ok: false, unknownIds };

  const qtyById = new Map<string, number>();
  for (const r of requested) qtyById.set(r.id, (qtyById.get(r.id) ?? 0) + r.qty);

  const lines: PricedLine[] = [...qtyById].map(([id, qty]) => {
    const p = byId.get(id) as BeautyProduct;
    return { id, name: p.name, priceInr: p.priceInr, qty };
  });
  return { ok: true, lines, totalInr: lines.reduce((s, l) => s + l.priceInr * l.qty, 0) };
}

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

export interface ReadingLite { key: string; label: string; level: string; intensity?: number }
const SEV: Record<string, number> = { priority: 1, attention: 0.85, monitor: 0.6, good: 0 };

/**
 * ── HOW BADLY THIS PERSON HAS THIS PROBLEM, AS A NUMBER ─────────────────────
 *
 * `SEV` has three non-zero values. That was the whole resolution of the primary
 * signal, and it was not enough: across a matched shelf of twenty-seven products
 * for one oily/acne profile, `matchScore` took exactly TWO distinct values. Every
 * comparison downstream that claims to break a tie "on effectiveness" —
 * `byEffect`, `better()`, the upgrade passes — was therefore falling straight
 * through to price, which is how a ₹167-a-month toner came to be replaced by a
 * ₹2,517 one on identical merits.
 *
 * So the level sets the band and the RAW SIGNAL COUNT places the reading inside
 * it. Three separate acne signals and one ticked box are both 'priority' and are
 * no longer the same number.
 *
 * `intensity` is absent on assessments saved before it existed, and absent is
 * NOT zero — a stored 'attention' with no count means "we knew this was
 * attention", not "we found nothing". It falls back to the count that level
 * implies, so an old row scores exactly where it always did.
 */
const IMPLIED_INTENSITY: Record<string, number> = { priority: 3, attention: 2, monitor: 1, good: 0 };
const BAND = 0.12;

export function severityOf(r: ReadingLite): number {
  const floor = SEV[r.level] ?? 0;
  if (floor <= 0) return 0;
  const n = Number.isFinite(r.intensity as number) ? (r.intensity as number) : (IMPLIED_INTENSITY[r.level] ?? 1);
  // Within a band, a fourth contributing signal is worth less than the second.
  const inside = Math.min(1, Math.max(0, n - 1) / 3);
  return Math.min(1, floor + BAND * inside);
}

/**
 * Profile-first ranking. Weighting: ~85% the skin & hair assessment (AI photo
 * analysis + onboarding profile), ~10% biomarker optimisation, ~5% preferences
 * (budget, allergies). A product is NEVER recommended on biomarkers alone — if
 * nothing in the user's skin/hair assessment calls for it, lab signals add zero.
 *
 * `conditions` is the citizen's declared medical conditions, and it is here
 * because it was not: the assessment printed "avoid retinoids" to a pregnant
 * citizen and this function, called without that field, handed them 1% retinol
 * in the same response. See shared/topical-contraindications.ts.
 */
export function recommendProducts(opts: {
  readings: ReadingLite[];
  concerns: string[];
  profile: { skinType?: string; budget?: string; allergies?: string[]; conditions?: string[] };
  insights: BeautyInsight[];
}): RecommendedProduct[] {
  const { readings, concerns, profile, insights } = opts;
  const skinType = (profile.skinType ?? 'normal').toLowerCase();
  const allergies = (profile.allergies ?? []).map((a) => a.toLowerCase()).filter(Boolean);
  const conditions = conditionsDeclared(profile.conditions ?? []);

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
    // TYPE-CHECKED RATHER THAN TRUSTED. `profile` is parsed out of a stored JSON
    // blob, so its fields are whatever was last written there — and when
    // something wrote an object over this string, `.match()` threw inside the
    // one function the market, the routine and the profile all pass through.
    // Three screens, one 500, and a message about the routine. A shape check is
    // one line; a stored blob is not a type.
    const b = typeof profile.budget === 'string' ? profile.budget : '';
    const nums = (b.match(/\d+/g) ?? []).map(Number);
    if (!nums.length) return null;
    return b.includes('+') ? Infinity : Math.max(...nums);
  })();

  const scored = BEAUTY_PRODUCTS
    // Hard filter: never surface something the user is allergic/sensitive to.
    //
    // This was `ingredient.toLowerCase().includes(declaredTerm)`, which is only
    // a filter when the citizen happens to type the exact ingredient string.
    // "tree nuts" does not appear in "almond oil"; "salicylates" does not appear
    // in "salicylic acid". Both passed straight through a line commented "hard
    // filter", which is the worst kind of guard — one that reads as settled.
    .filter((p) => isTopicallySafe(p.name, [...p.actives, p.keyIngredient], allergies))
    // And never something a declared condition rules out. Separate from the
    // allergy filter because the two say different things to the citizen: one is
    // "you told us this reacts with you", the other is "not while you are
    // pregnant", and a shelf that conflates them explains neither.
    .filter((p) => isSafeForConditions(p.name, [...p.actives, p.keyIngredient], conditions))
    .map((p) => {
      /**
       * NOT `p.profileKeys` — the keys this product may be MATCHED on.
       *
       * A beard oil in the Hair Care band legitimately carries `density`; what
       * it must not do is answer a scalp reading with it. `claimableKeys` drops
       * the scalp keys from anything whose site is not the scalp, and keeps the
       * row's data intact so the shelf still shows the product to somebody
       * shopping for a beard oil.
       */
      const claimable = claimableKeys(p);
      const matchedAttrs = claimable.map((k) => need.get(k)).filter(Boolean) as ReadingLite[];
      /**
       * ── 'ALL SKIN TYPES' IS NOT A CLAIM ABOUT SENSITIVE SKIN ──────────────
       *
       * It is a claim about the oily-to-dry scale, which is what the phrase
       * means on a bottle: this will not be too rich for you or too stripping.
       * Sensitivity is a different axis — how readily skin reacts — and a
       * formula that has not said anything about it has not said it is fine.
       *
       * Measured: 76 of 132 face products declared `all`, and a citizen with
       * sensitive skin reached 91 of them while only FIFTEEN named her. Seven
       * of the 91 carried a retinoid. That is how a reactive face was offered
       * Olay Retinol24 and Minimalist Retinol 0.3% in the same routine — not
       * through a bug, but through a word doing more work than it can bear.
       *
       * So `all` covers the four base types and stops. Sensitive skin reaches a
       * product when the sheet's own Skin/Hair Type column names it, and the
       * shelf that leaves her is built out of vendors' declarations rather than
       * out of the adjectives in their marketing copy.
       */
      const suitable = p.suitableSkin.includes(skinType)
        || (p.suitableSkin.includes('all') && skinType !== 'sensitive');

      /**
       * 85% — skin & hair profile, and it is now CONTINUOUS.
       *
       * The old formula was `min(1, best + breadth + 0.05)` and it saturated
       * almost immediately: an 'attention' finding (0.85) plus one more matched
       * key (0.08) plus the constant already exceeded 1, so most of the shelf
       * scored identically and the ranking below it was decorative.
       *
       * Three things are measured instead, and they are different questions:
       *
       *   COVERAGE  how much of what is actually WRONG with this person does
       *             this product address — severity-weighted, so answering
       *             their worst finding counts for more than answering their
       *             mildest. This is the question the old `best` was reaching
       *             for and could not express.
       *   FOCUS     how much of the product is FOR them. A cream claiming six
       *             keys of which two are theirs is a less pointed answer than
       *             one claiming two, both theirs — and the old formula
       *             rewarded the scattergun, because breadth counted matches
       *             and never counted misses.
       *   FIT       a product that names their skin type is a better answer
       *             than one that says "all skin types". Both are allowed
       *             through; only one of them chose.
       */
      let profilePart = 0;
      if (matchedAttrs.length > 0 && suitable) {
        const demand = [...need.values()].reduce((n, r) => n + severityOf(r), 0);
        const answered = matchedAttrs.reduce((n, r) => n + severityOf(r), 0);
        const coverage = demand > 0 ? Math.min(1, answered / demand) : 0;
        // Over the CLAIMABLE keys, not all of them: a product that cannot use
        // half its keys for this person is not thereby more focused on them.
        const focus = claimable.length > 0 ? matchedAttrs.length / claimable.length : 0;
        const fit = p.suitableSkin.includes(skinType) ? 1 : 0.94;
        // Coverage leads because it is the only one of the three that is about
        // the person rather than about the product.
        profilePart = 0.85 * fit * Math.min(1, 0.62 * coverage + 0.26 * focus + 0.12);
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
