import type { Unit } from './nutrients';

/**
 * THE MULTIVITAMIN LABEL DATABASE — WHAT IS ACTUALLY IN THE TABLET.
 *
 * `products.ts` is the shelf: a brand, a price, a photograph, a link. It
 * answers "what can be bought". This file answers a different and much harder
 * question — "what is in it, per nutrient, in what chemical form, and who
 * says so" — and it is the question every claim in this hub about dose,
 * ceiling, stacking or regulatory status resolves to.
 *
 * A row in `products.ts` needs a `supplement` id and a price. A row here needs
 * a composition, and if there is no verifiable composition then the row still
 * exists and says COMPOSITION UNKNOWN, because a product this city can name
 * and cannot describe is a fact about the market that the reader is owed.
 * Eleven of the thirty-two rows below are exactly that.
 *
 * ── WHERE THIS CAME FROM, AND WHY THAT MATTERS ────────────────────────────
 *
 * Checked 29 August 2026 against retailer and brand product-detail panels —
 * Tata 1mg, PharmEasy, Apollo, Netmeds, Truemeds, Nutrabay, HealthKart, and
 * the brands' own stores. `compositionSource` records which, per product.
 *
 * NONE OF IT IS A PHOTOGRAPH OF A LABEL, and that limitation is structural
 * rather than incidental. The richest source in India is 1mg's `key
 * ingredients` panel, which is a data-entry artefact of a retailer rather than
 * a transcription of a pack. It strips chemical forms — printing "Vitamin C
 * 80 mg" where the label says ascorbic acid — and it renders vitamin D as
 * "D2" on a long list of products whose own marketing says D3. Amway's and
 * Apollo's independent statements make it likely that at least some of those
 * D2 declarations are real, and a deliberate vegetarian-compliance choice,
 * since D2 is yeast-derived and D3 is usually lanolin. It is not resolved
 * here. It is flagged on every affected row and it is the single highest-value
 * thing a photograph would settle.
 *
 * ── THE ONE-RDA CEILING, WHICH IS THE REASON THIS FILE IS INTERESTING ─────
 *
 * India caps a vitamin or mineral in a food-category health supplement at ONE
 * ICMR RDA. That ceiling was not always there: until the gazette amendment of
 * 6 September 2021 a plain multivitamin tablet sat OUTSIDE food law entirely,
 * and the amendment brought pill formats in and fixed the ceiling in the same
 * stroke. Above one RDA in a dosage format, a product is not a food — it is a
 * drug under the Drugs and Cosmetics Act, and FSSAI confirmed in June 2023
 * that it would not even consider approvals above the line.
 *
 * That is a legal fact with a startling empirical consequence, visible in the
 * rows below. Every Indian-designed nutraceutical here sits at or under one
 * RDA — Zincovit, A to Z NS+, both Nutrilites, both HK Vitals, MB-Vite, the
 * melts strips — and three of them are pinned to it with a precision that can
 * only be deliberate: seven nutrients at exactly 100%, none above. Meanwhile
 * five legacy pharma B-complex products blow through it, one of them by
 * two orders of magnitude. Supradyn Daily carries 500 mcg of B12 against a
 * 2.2 mcg requirement — 227 times — and is sold on a retailer's food-category
 * page next to products engineered to the cap.
 *
 * This file does not adjudicate that. It records the composition, records the
 * channel the product is actually sold through, and lets `exposure.ts` compute
 * the exceedance and say what it implies. The engine's job is to tell a
 * citizen what they would be swallowing, not to enforce a statute.
 *
 * ── WHAT IS DELIBERATELY NOT CLEANED UP ───────────────────────────────────
 *
 * A listing declaring "chromium 50 mg" is out by a thousandfold and would be
 * frankly toxic if true. A listing declaring lutein at 1 mcg is a thousandth
 * of any functional dose. A probiotic at "250 CFU" is missing the word
 * million. Each of those is carried in `dataFlags` in the words it was found
 * in, and the affected row is marked, because a database that silently
 * repairs its sources is a database whose errors are invisible. The engine
 * must refuse to compute on a flagged row rather than compute on a corrected
 * guess.
 */

export type DosageForm =
  | 'tablet' | 'film-coated tablet' | 'sugar-coated tablet' | 'bilayer tablet'
  | 'capsule' | 'softgel' | 'effervescent' | 'oral strip' | 'gummy' | 'sachet' | 'syrup';

export type Demographic =
  | 'adult' | 'adult-men' | 'adult-women' | 'over-50' | 'children' | 'prenatal';

/** How good the composition is, and it is never assumed. */
export type CompositionSource =
  | 'brand-label'      // the brand publishes its own full ingredient statement
  | 'retailer-panel'   // a retailer's structured composition table
  | 'partial'          // some quantities published, others not
  | 'UNKNOWN';         // nothing quantified anywhere reachable

/**
 * THE CHANNEL A PRODUCT IS ACTUALLY SOLD THROUGH — which is an observation,
 * not a legal classification. `exposure.ts` computes what the composition
 * IMPLIES the classification should be, and the interesting products are the
 * ones where the two disagree.
 */
export type Channel =
  | 'food-otc'   // sold on a retailer's supplement/OTC food page
  | 'drug-otc'   // pharmacopoeial-grade manufacture, sold without prescription
  | 'drug-rx'    // retailer states a prescription is required
  | 'UNKNOWN';

export interface Row {
  /** An id in NUTRIENTS. The spec asserts every one of these resolves. */
  nutrient: string;
  /** The chemical form AS PRINTED. null means the panel did not say — which
   *  is a fact about the label, not a gap to be filled from a formulary. */
  form: string | null;
  amount: number;
  unit: Unit;
  /** Set where this specific figure cannot be trusted. A flagged row is
   *  excluded from every total the engine computes. */
  suspect?: string;
}

/** Ingredients that are not reference nutrients — botanicals, amino acids,
 *  carotenoids other than beta-carotene, probiotics. Counted against no
 *  ceiling because no body has set one. */
export interface Other {
  name: string;
  amount: number | null;
  unit?: string;
  note?: string;
}

export interface Formulation {
  id: string;
  brand: string;
  productName: string;
  /** null is UNKNOWN throughout this interface, and is never a blank string. */
  manufacturer: string | null;
  marketer: string | null;
  form: DosageForm;
  /** Units taken per day per the label. Neurobion says two, and every figure
   *  in its row therefore doubles before it means anything. */
  servingsPerDay: number;
  pack: string;
  demographic: Demographic;
  vegetarian: boolean | null;
  vegNote: string;
  fssaiLicence: string | null;
  channel: Channel;
  channelNote: string;
  /** false, or the reference standard the label names. Exactly one brand in
   *  thirty-two names one. */
  declaresPctRda: false | { against: string };
  thirdParty: string | null;
  price: string | null;
  priceInr: number | null;
  retailer: string;
  url: string;
  /** ISO date the composition was checked. Formulations change; a row without
   *  a date is a row nobody can age. */
  verifiedOn: string;
  compositionSource: CompositionSource;
  nutrients: Row[];
  others: Other[];
  /** Defects found in the source and carried forward rather than repaired. */
  dataFlags: string[];
  /** Required when compositionSource is UNKNOWN: what would settle it. */
  unknownBecause?: string;
}

const CHECKED = '2026-08-29';

/** One nutrient row. `form` defaults to null — meaning the panel did not print
 *  a chemical form, which is the common case and is worth showing as a gap. */
const r = (nutrient: string, amount: number, unit: Unit, form: string | null = null, suspect?: string): Row =>
  ({ nutrient, form, amount, unit, ...(suspect ? { suspect } : {}) });

const MAXCURE = 'Maxcure Nutravedics Limited, Ranipur, Haridwar 249403, Uttarakhand';

/** The vitamin D question the whole database turns on. Attached to every row
 *  where a retailer panel says D2 and the brand's own copy says D3. */
const D2_DISPUTE =
  'The retailer composition panel declares vitamin D2 (ergocalciferol); other retailers\' descriptive copy for the same product says D3. D2 is yeast-derived and carries a green dot, D3 is usually lanolin and would not — so this may be a deliberate vegetarian-compliance choice or it may be a retailer data-entry artefact. It changes both the vegetarian claim and the efficiency with which the product raises 25(OH)D. Only a photograph of the label settles it.';

export const FORMULATIONS: Formulation[] = [
  /* ── SECTION 1 · PHARMA-MARKETED MASS BRANDS ───────────────────────────── */
  {
    id: 'centrum-men-in',
    brand: 'Centrum',
    productName: 'Centrum Men (18+)',
    manufacturer: MAXCURE,
    marketer: 'GlaxoSmithKline Asia Pvt. Ltd., Nabha 147201, Punjab',
    form: 'film-coated tablet',
    servingsPerDay: 1,
    pack: '30 tablets',
    demographic: 'adult-men',
    vegetarian: true,
    vegNote: 'Green dot. No gelatin or fish oil declared.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Sold on retailer OTC/food-supplement pages. Carries "NOT FOR MEDICINAL USE". No FSSAI licence number published on any listing.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹396 / 30 tablets',
    priceInr: 396,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/centrum-men-vegetarian-tablets-for-muscles-heart-immunity-world-s-no.1-multivitamin-nutrition-formula-otc772915',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 800, 'mcg'), r('vitamin-c', 80, 'mg'), r('vitamin-d', 600, 'IU', 'declared D2'),
      r('vitamin-e', 5, 'mg'), r('vitamin-k', 55, 'mcg', 'K1'), r('biotin', 25, 'mcg'),
      r('folate', 200, 'mcg DFE'), r('vitamin-b12', 2.2, 'mcg'), r('vitamin-b1', 1.2, 'mg'),
      r('vitamin-b2', 1.2, 'mg'), r('vitamin-b3', 15, 'mg'), r('vitamin-b5', 5, 'mg'),
      r('vitamin-b6', 1.3, 'mg'), r('calcium', 250, 'mg'), r('iron', 3.7, 'mg'),
      r('zinc', 11, 'mg'), r('iodine', 140, 'mcg'), r('magnesium', 66, 'mg'),
      r('manganese', 1.2, 'mg'), r('copper', 450, 'mcg'), r('selenium', 40, 'mcg'),
      r('chromium', 17.5, 'mcg'), r('molybdenum', 45, 'mcg'),
    ],
    others: [{ name: 'Grape seed extract (proanthocyanidins 95%)', amount: 100, unit: 'mg' }],
    dataFlags: [D2_DISPUTE, 'The brand\'s own Indian store publishes no composition table at all — only "23 essential nutrients" and "always read the label".'],
  },
  {
    id: 'centrum-women-in',
    brand: 'Centrum',
    productName: 'Centrum Women (18+)',
    manufacturer: MAXCURE,
    marketer: 'GlaxoSmithKline Asia Pvt. Ltd., Nabha 147201, Punjab',
    form: 'film-coated tablet',
    servingsPerDay: 1,
    pack: '30 tablets',
    demographic: 'adult-women',
    vegetarian: true,
    vegNote: 'Vegetarian, gluten-free, non-GMO per the listing.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: '"Dietary supplement. Not for medicinal use." No FSSAI number published.',
    declaresPctRda: { against: 'unnamed — but the denominators back-calculate to ICMR 2020 adult female values (vitamin C 65 mg = 100%, niacin 14 mg = 100%), so it is almost certainly ICMR, undeclared' },
    thirdParty: null,
    price: '₹437 / 30 tablets',
    priceInr: 437,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/centrum-women-vegetarian-tablets-for-muscles-heart-immunity-world-s-no.1-multivitamin-otc772920',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 800, 'mcg'), r('vitamin-c', 65, 'mg'), r('vitamin-d', 600, 'IU', 'declared D2'),
      r('vitamin-e', 9, 'mg'), r('vitamin-k', 55, 'mcg', 'K1'), r('biotin', 25, 'mcg'),
      r('folate', 220, 'mcg DFE'), r('vitamin-b12', 2.2, 'mcg'), r('vitamin-b1', 1, 'mg'),
      r('vitamin-b2', 1, 'mg'), r('vitamin-b3', 14, 'mg'), r('vitamin-b5', 5, 'mg'),
      r('vitamin-b6', 1.3, 'mg'), r('calcium', 325, 'mg'), r('iron', 4.4, 'mg'),
      r('zinc', 11, 'mg'), r('iodine', 140, 'mcg'), r('magnesium', 66, 'mg'),
      r('manganese', 1.8, 'mg'), r('copper', 450, 'mcg'), r('selenium', 40, 'mcg'),
      r('chromium', 30, 'mcg'), r('molybdenum', 45, 'mcg'),
    ],
    others: [{ name: 'Hyaluronic acid', amount: 5, unit: 'mg' }],
    dataFlags: [
      D2_DISPUTE,
      'The only product in this survey publishing a per-nutrient %RDA column — and it does not name the standard it is a percentage of.',
      'Iron is declared at 15% of the ICMR requirement for a woman. This is not an iron-repletion product for a menstruating woman, whatever the marketing says.',
    ],
  },
  {
    id: 'centrum-50plus-in',
    brand: 'Centrum',
    productName: 'Centrum Adult 50+',
    manufacturer: MAXCURE,
    marketer: 'GlaxoSmithKline Asia Pvt. Ltd., Nabha 147201, Punjab',
    form: 'film-coated tablet',
    servingsPerDay: 1,
    pack: '50 tablets',
    demographic: 'over-50',
    vegetarian: true,
    vegNote: 'Vegetarian.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Carries "not intended to diagnose, treat, cure or prevent any disease" rather than the "not for medicinal use" wording its siblings use.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹612 / 50 tablets',
    priceInr: 612,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/centrum-adult-50-veg-tablets-for-joints-heart-immunity-world-s-no.1-multivitamin-multimineral-otc772903',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 800, 'mcg'), r('vitamin-c', 65, 'mg'), r('vitamin-d', 600, 'IU', 'declared D2'),
      r('vitamin-e', 9, 'mg'), r('vitamin-k', 55, 'mcg', 'K1'), r('biotin', 25, 'mcg'),
      r('folate', 220, 'mcg DFE'), r('vitamin-b12', 2.2, 'mcg'), r('vitamin-b1', 1, 'mg'),
      r('vitamin-b2', 1.1, 'mg'), r('vitamin-b3', 11, 'mg'), r('vitamin-b5', 5, 'mg'),
      r('vitamin-b6', 1.3, 'mg'), r('calcium', 250, 'mg'), r('iron', 4.4, 'mg'),
      r('zinc', 11, 'mg'), r('iodine', 140, 'mcg'), r('magnesium', 66, 'mg'),
      r('manganese', 2.3, 'mg'), r('copper', 900, 'mcg'), r('selenium', 40, 'mcg'),
      r('chromium', 30, 'mcg'), r('molybdenum', 45, 'mcg'),
    ],
    others: [{ name: 'Boswellia serrata extract (boswellic acid 65%)', amount: 250, unit: 'mg' }],
    dataFlags: [D2_DISPUTE, 'The American "Centrum Silver" formula is a different product — higher D3, no boswellia. Do not read US figures onto this row.'],
  },
  {
    id: 'revital-h-men',
    brand: 'Sun Pharma',
    productName: 'Revital H (Men)',
    manufacturer: 'Sun Pharma Laboratories Ltd',
    marketer: 'Sun Pharmaceutical Industries Ltd, Andheri-Kurla Road, Mumbai 400059',
    form: 'softgel',
    servingsPerDay: 1,
    pack: '30 capsules',
    demographic: 'adult-men',
    vegetarian: false,
    vegNote: 'NON-VEGETARIAN. Brown dot, and "GELATIN FOOD GRADE" is declared in the other-ingredients list. Vitamin D declared as D3 with no source stated, so lanolin cannot be excluded.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: '"Not for medicinal use". Retailer OTC page. No FSSAI number.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹315 / 30 capsules',
    priceInr: 315,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/revital-h-men-multivitamin-with-calcium-zinc-ginseng-for-immunity-strong-bones-energy-otc66303',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 1500, 'IU'), r('vitamin-d', 300, 'IU', 'D3'), r('vitamin-c', 33, 'mg'),
      r('vitamin-e', 7, 'mg'), r('vitamin-b1', 1, 'mg'), r('vitamin-b2', 1.4, 'mg'),
      r('vitamin-b3', 10, 'mg'), r('vitamin-b6', 0.8, 'mg'), r('vitamin-b12', 0.8, 'mcg'),
      r('folate', 80, 'mcg', 'folic acid'), r('calcium', 76.9, 'mg'), r('phosphorus', 59.43, 'mg'),
      r('iron', 10, 'mg'), r('zinc', 10.29, 'mg'), r('magnesium', 3.13, 'mg'),
      r('potassium', 2.07, 'mg'), r('manganese', 0.6, 'mg'), r('copper', 520, 'mcg'),
      r('iodine', 100, 'mcg'),
    ],
    others: [{ name: 'Panax ginseng root extract (3%)', amount: 212.5, unit: 'mg' }],
    dataFlags: ['A low-dose formula — B12 at roughly a third of the requirement, folate at a quarter. The selling proposition is the ginseng, not the micronutrients.'],
  },
  {
    id: 'revital-woman',
    brand: 'Sun Pharma',
    productName: 'Revital Woman',
    manufacturer: MAXCURE,
    marketer: 'Sun Pharmaceutical Industries Ltd, Mumbai',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '30 tablets',
    demographic: 'adult-women',
    vegetarian: true,
    vegNote: 'Vegetarian tablet — a different dosage form from the men\'s softgel. Contains soy, declared as an allergen.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Retailer OTC page. No FSSAI number.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹375 / 30 tablets',
    priceInr: 375,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/revital-h-woman-tablet-with-multivitamins-calcium-zinc-natural-ginseng-for-daily-immunity-strong-bones-energy-otc325631',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('calcium', 250, 'mg'), r('phosphorus', 125, 'mg'), r('magnesium', 100, 'mg'),
      r('vitamin-c', 30, 'mg'), r('iron', 21, 'mg'), r('zinc', 10, 'mg'),
      r('vitamin-b3', 7, 'mg'), r('vitamin-e', 5, 'mg'), r('manganese', 4, 'mg'),
      r('copper', 1700, 'mcg'), r('vitamin-b6', 1.6, 'mg'), r('vitamin-b2', 0.88, 'mg'),
      r('vitamin-b1', 0.8, 'mg'), r('iodine', 100, 'mcg'), r('folate', 80, 'mcg', 'folic acid'),
      r('vitamin-a', 1300, 'IU'), r('vitamin-d', 300, 'IU', 'declared D2'), r('selenium', 40, 'mcg'),
      r('chromium', 30, 'mcg'), r('vitamin-k', 25, 'mcg', 'K1'), r('biotin', 20, 'mcg'),
      r('vitamin-b12', 0.8, 'mcg'),
    ],
    others: [{ name: 'Panax ginseng root extract (3%)', amount: 212.5, unit: 'mg' }],
    dataFlags: [
      'Structurally a different product from Revital H Men, not a colour variant: different manufacturer, different dosage form, different veg status, iron 10 mg → 21 mg, magnesium 3.13 mg → 100 mg, vitamin D3 → D2.',
      'Folic acid at 80 mcg in a women\'s product is strikingly low against a 220 mcg requirement, and far below the 400 mcg periconceptional figure.',
    ],
  },
  {
    id: 'zincovit',
    brand: 'Apex Laboratories',
    productName: 'Zincovit Tablet',
    manufacturer: 'Apex Laboratories Private Limited, SIDCO Pharmaceutical Complex, Alathur 603110, Tamil Nadu',
    marketer: 'Apex Laboratories Private Limited',
    form: 'sugar-coated tablet',
    servingsPerDay: 1,
    pack: 'strip of 15',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian per Apollo. Vitamin D3 explicitly declared "as Lichen" — vegan, and explicitly not lanolin. The only mass-pharma product in this survey to declare a lichen D3.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Netmeds files it under Supplements, Apollo under OTC. Neither publishes an FSSAI number nor a drug licence number.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹106 / 15 tablets',
    priceInr: 106,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/zincovit-tablet-with-multivitamin-multimineral-grape-seed-extract-otc111998',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 1000, 'mcg'), r('vitamin-c', 80, 'mg'), r('vitamin-d', 200, 'IU', 'D3 from lichen — 5 µg as printed'),
      r('vitamin-e', 10, 'mg', 'alpha-tocopherol'), r('vitamin-b1', 1.8, 'mg', 'thiamine'),
      r('vitamin-b2', 2.5, 'mg', 'riboflavin'), r('vitamin-b3', 18, 'mg', 'niacin'),
      r('vitamin-b5', 3, 'mg', 'pantothenic acid'), r('vitamin-b6', 2.4, 'mg', 'pyridoxine'),
      r('biotin', 30, 'mcg'), r('folate', 150, 'mcg', 'folic acid'),
      r('vitamin-b12', 2, 'mcg', 'cobalamin'), r('zinc', 17, 'mg'), r('magnesium', 3, 'mg'),
      r('manganese', 0.25, 'mg'), r('iodine', 140, 'mcg'), r('copper', 30, 'mcg'),
      r('selenium', 40, 'mcg'), r('chromium', 50, 'mcg'),
    ],
    others: [{ name: 'Grape seed extract', amount: 50, unit: 'mg' }],
    dataFlags: [
      'Pinned to the ICMR adult-male requirement with unusual precision: vitamin A, C, B1, B2, B3, B6 and zinc are each EXACTLY 100% and nothing is above. That is a deliberate compliance design and the clearest evidence in this database that the one-RDA ceiling is a live constraint on Indian formulators.',
      'Apollo\'s ingredient list declares a synthetic food colour (INS 214) that the 1mg panel does not surface.',
    ],
  },
  {
    id: 'supradyn-daily',
    brand: 'Bayer',
    productName: 'Supradyn Daily',
    manufacturer: 'Piramal Enterprises Limited, Mahad, Maharashtra',
    marketer: 'Bayer Pharmaceuticals Pvt Ltd, Thane (West)',
    form: 'tablet',
    servingsPerDay: 1,
    pack: 'strip of 15',
    demographic: 'adult',
    vegetarian: null,
    vegNote: 'UNKNOWN — no veg or non-veg declaration on the listing.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Sold on a retailer OTC/food page. But "copper sulphate pentahydrate BP" is a pharmacopoeial-grade designation and the plant is a pharmaceutical one — this is formulated as a drug and sold beside foods.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹75 / 15 tablets',
    priceInr: 75,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/supradyn-daily-multivitamin-for-men-and-women-daily-immunity-and-2x-energy-tablet-otc657862',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 5000, 'IU'), r('vitamin-d', 400, 'IU', 'cholecalciferol'),
      r('vitamin-c', 75, 'mg', 'ascorbic acid'), r('vitamin-e', 25, 'mg', 'tocopheryl acetate'),
      r('vitamin-b1', 5, 'mg', 'thiamine'), r('vitamin-b2', 5, 'mg', 'riboflavin'),
      r('vitamin-b3', 50, 'mg', 'nicotinamide'), r('vitamin-b5', 10, 'mg', 'calcium D-pantothenate'),
      r('vitamin-b6', 1.5, 'mg'), r('biotin', 150, 'mcg'),
      r('folate', 1500, 'mcg', 'folic acid'), r('vitamin-b12', 500, 'mcg', 'methylcobalamin'),
      r('magnesium', 10, 'mg', 'magnesium oxide'), r('zinc', 55, 'mg', 'zinc sulfate'),
      r('copper', 2000, 'mcg', 'copper sulphate pentahydrate BP'),
      r('chromium', 250, 'mcg', 'chromium picolinate'), r('selenium', 70, 'mcg'),
      r('molybdenum', 25, 'mcg', 'sodium molybdate'),
      r('manganese', 0.005, 'mg', 'manganese sulphate monohydrate', 'Declared as 5 mcg, which is two to three orders of magnitude below every comparable product. Probably a unit error for 5 mg; carried as printed and excluded from totals.'),
    ],
    others: [{ name: 'L-glutamic acid', amount: 50, unit: 'mg' }],
    dataFlags: [
      'EIGHT nutrients above one ICMR RDA, two of them by more than an order of magnitude. B12 at 500 mcg against a 2.2 mcg requirement is 227×. Folic acid at 1.5 mg is 5×. Zinc at 55 mg elemental is above the tolerable upper limit outright.',
      'Methylcobalamin is not on India\'s permitted-forms schedule for a health supplement, which lists only cyanocobalamin and hydroxocobalamin. On composition alone this cannot lawfully be a food-category health supplement — and it is sold on a food-category page.',
      'This is the single most consequential stacking risk in the database: anybody taking it alongside another multivitamin is already past a ceiling before the second tablet.',
    ],
  },
  {
    id: 'supradyn-immuno-plus',
    brand: 'Bayer',
    productName: 'Supradyn Immuno+ (Turmeric & Tulsi)',
    manufacturer: 'Tirupati Lifesciences Pvt. Ltd., Paonta Sahib, Himachal Pradesh',
    marketer: 'Bayer Pharmaceuticals Pvt Ltd, Thane (West)',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '30 tablets',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Retailer OTC page. No FSSAI number.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹236 / 30 tablets',
    priceInr: 236,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/supradyn-immuno-multivitamin-with-turmeric-tulsi-tablet-for-energy-immunity-otc772582',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('beta-carotene', 2100, 'mcg', 'provitamin A, beta-carotene 20%', 'The declaration is genuinely ambiguous between 2,100 mcg of a 20%-strength beadlet (about 420 mcg of carotene) and 2,100 mcg of carotene itself. It is the product\'s only vitamin A source, so whether it delivers a meaningful vitamin A dose at all is unresolved.'),
      r('vitamin-c', 40, 'mg'), r('vitamin-b3', 12, 'mg'), r('vitamin-e', 10, 'mg'),
      r('vitamin-b5', 3, 'mg'), r('vitamin-b6', 2, 'mg'), r('vitamin-b2', 1.1, 'mg'),
      r('vitamin-b1', 1, 'mg'), r('folate', 100, 'mcg', 'folic acid'), r('biotin', 30, 'mcg'),
      r('vitamin-k', 25, 'mcg'), r('vitamin-d', 400, 'IU', 'declared D2 — 10 µg as printed'),
      r('calcium', 100, 'mg'), r('magnesium', 50, 'mg'), r('potassium', 40, 'mg'),
      r('iron', 17, 'mg'), r('zinc', 10, 'mg'), r('manganese', 4, 'mg'),
      r('copper', 1350, 'mcg'), r('iodine', 110, 'mcg'), r('selenium', 40, 'mcg'),
      r('chromium', 33, 'mcg'),
    ],
    others: [
      { name: 'L-lysine hydrochloride', amount: 50, unit: 'mg' },
      { name: 'Inositol', amount: 25, unit: 'mg' },
      { name: 'Glutathione', amount: 25, unit: 'mg' },
      { name: 'Asparagus racemosus (shatavari) extract', amount: 50, unit: 'mg' },
      { name: 'Saraca indica (ashoka) extract', amount: 50, unit: 'mg' },
      { name: 'Ocimum sanctum (tulsi) extract', amount: 50, unit: 'mg' },
      { name: 'Curcuma longa (turmeric) extract', amount: 25, unit: 'mg' },
    ],
    dataFlags: [
      'CONTAINS BETA-CAROTENE — the smoker contraindication applies, and no listing carries any warning.',
      'No vitamin B12 is declared at all, which is a striking omission in a product sold on energy and immunity.',
      D2_DISPUTE,
    ],
  },
  {
    id: 'a-to-z-ns-plus',
    brand: 'Alkem',
    productName: 'A to Z NS+',
    manufacturer: 'Alkem Laboratories Ltd, Namthang, South Sikkim 737132',
    marketer: 'Alkem Laboratories Ltd, Lower Parel, Mumbai 400013',
    form: 'tablet',
    servingsPerDay: 1,
    pack: 'strip of 15',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Described by the retailer as an over-the-counter supplement. No FSSAI number published.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹178 / 15 tablets',
    priceInr: 178,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/a-to-z-ns-daily-multivitamin-tablets-zinc-vitamin-c-for-immunity-b-complex-essential-nutrients-for-energy-wellness-otc747985',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-c', 65, 'mg', 'ascorbic acid'), r('vitamin-b3', 14, 'mg', 'niacinamide'),
      r('vitamin-e', 10, 'mg'), r('vitamin-b5', 4, 'mg', 'calcium pantothenate'),
      r('vitamin-b6', 1.5, 'mg', 'pyridoxine hydrochloride'), r('vitamin-b2', 1.3, 'mg', 'riboflavin'),
      r('vitamin-b1', 1.1, 'mg', 'thiamine mononitrate'), r('vitamin-a', 600, 'mcg', 'vitamin A acetate (retinyl acetate)'),
      r('folate', 117, 'mcg', 'folic acid'), r('biotin', 30, 'mcg'),
      r('vitamin-d', 200, 'IU', '5 µg as printed; form not stated'), r('vitamin-b12', 1, 'mcg', 'cyanocobalamin'),
      r('zinc', 10, 'mg', 'zinc oxide'), r('manganese', 2, 'mg', 'manganese chloride'),
      r('copper', 1700, 'mcg', 'copper gluconate'), r('iodine', 140, 'mcg', 'potassium iodide'),
      r('chromium', 30, 'mcg', 'chromium chloride'), r('selenium', 30, 'mcg', 'sodium selenate'),
    ],
    others: [{ name: 'Lycopene', amount: 2, unit: 'mg' }],
    dataFlags: [
      'The most fully-specified mainstream pharma label found — chemical forms given for nearly every nutrient, which is rare enough to be worth saying.',
      'Zinc oxide is the cheapest and least bioavailable common zinc salt. Named here because the label named it.',
      'Contains no iron and no calcium at all.',
      'Folic acid at 117 mcg is a US Daily Value-derived figure (117 mcg folic acid ≈ 200 mcg DFE), which suggests the formula was designed against an American reference and never restated to ICMR.',
    ],
  },
  {
    id: 'becosules',
    brand: 'Pfizer',
    productName: 'Becosules Capsule',
    manufacturer: 'Pfizer Ltd, Mumbai',
    marketer: 'Pfizer Ltd, Mumbai',
    form: 'capsule',
    servingsPerDay: 1,
    pack: 'strip of 20',
    demographic: 'adult',
    vegetarian: null,
    vegNote: 'UNKNOWN — no veg or non-veg declaration on any listing, and a capsule shell of unstated origin is a material gap.',
    fssaiLicence: null,
    channel: 'drug-otc',
    channelNote: 'Pfizer publishes a Summary of Prescribing Information for it — drug-regulatory documentation — and the retailer sells it on an OTC page as a nutritional supplement.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹67.90 / 20 capsules',
    priceInr: 68,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/becosules-capsule-with-b-complex-vitamin-c-for-mouth-ulcers-otc114687',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-b1', 10, 'mg', 'thiamine mononitrate'), r('vitamin-b2', 10, 'mg', 'riboflavin'),
      r('vitamin-b3', 100, 'mg', 'niacinamide'), r('vitamin-b5', 50, 'mg', 'calcium pantothenate'),
      r('vitamin-b6', 3, 'mg', 'pyridoxine hydrochloride'),
      r('vitamin-b12', 15, 'mcg', 'as Stablets 1:100 — a pharmacopoeial trituration spec, not food-supplement language'),
      r('folate', 1500, 'mcg', 'folic acid'), r('vitamin-c', 150, 'mg', 'ascorbic acid'),
      r('biotin', 100, 'mcg'),
    ],
    others: [],
    dataFlags: [
      'Seven of nine declared nutrients are above one ICMR RDA. Niacinamide at 100 mg is nearly three times the supplemental ceiling for niacin; folic acid at 1.5 mg is five times the requirement and above the level at which it masks B12 deficiency.',
      'Unambiguously a drug formulation sold through consumer channels.',
    ],
  },
  {
    id: 'neurobion-forte',
    brand: 'P&G Health',
    productName: 'Neurobion Forte',
    manufacturer: 'Procter & Gamble Health Ltd, Verna Industrial Estate, Goa 403722',
    marketer: 'Procter & Gamble Health Ltd',
    form: 'tablet',
    servingsPerDay: 2,
    pack: 'strip of 30',
    demographic: 'adult',
    vegetarian: false,
    vegNote: 'NON-VEGETARIAN in substance and undeclared on the listing: the B12 is printed as "Cyanocobalamin Tartarate in Gelatin". The product carries no veg or non-veg mark at all.',
    fssaiLicence: null,
    channel: 'drug-otc',
    channelNote: 'Colours declared as Ponceau 4R Lake and Titanium Dioxide IP — Indian Pharmacopoeia grade excipients confirm drug-category manufacture.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹47.53 / 30 tablets',
    priceInr: 48,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/neurobion-forte-tablet-relief-from-tingling-numbness-weakness-otc356742',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-b1', 10, 'mg', 'thiamine mononitrate'), r('vitamin-b2', 10, 'mg', 'riboflavin'),
      r('vitamin-b3', 45, 'mg', 'nicotinamide'), r('vitamin-b5', 50, 'mg', 'calcium pantothenate'),
      r('vitamin-b6', 3, 'mg', 'pyridoxine hydrochloride'),
      r('vitamin-b12', 15, 'mcg', 'cyanocobalamin tartarate in gelatin'),
    ],
    others: [],
    dataFlags: [
      'THE SERVING IS TWO TABLETS A DAY, so every figure above doubles before it means anything: 20 mg of B1 (11× the requirement), 20 mg of B2 (8×), 90 mg of niacinamide, 6 mg of B6, 30 mcg of B12 (13.6×).',
      'B6 at 6 mg a day sustained sits in a product marketed precisely for tingling and numbness — which is the presenting symptom of B6 neuropathy. That is not a claim that this product causes it; it is a reason the label deserves reading.',
    ],
  },
  {
    id: 'cobadex-czs',
    brand: 'GlaxoSmithKline',
    productName: 'Cobadex CZS',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd, Dr Annie Besant Road, Mumbai 400030',
    marketer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    form: 'tablet',
    servingsPerDay: 1,
    pack: 'strip of 15',
    demographic: 'adult',
    vegetarian: null,
    vegNote: 'UNKNOWN — not stated.',
    fssaiLicence: null,
    channel: 'drug-rx',
    channelNote: 'The retailer lists it on a /drugs/ page, not an /otc/ one, and states that a prescription is required. Included as the boundary case: it has near-identical B-vitamin architecture to Becosules, and the two are sold through different regulatory channels.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹120 / 15 tablets',
    priceInr: 120,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/drugs/cobadex-czs-tablet-with-essential-vitamins-nutritional-supplement-152973',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-b3', 100, 'mg', 'nicotinamide'),
      r('zinc', 22.5, 'mg', 'zinc sulphate monohydrate 61.8 mg, equivalent to elemental zinc'),
      r('vitamin-b6', 3, 'mg', 'pyridoxine hydrochloride'),
      r('folate', 1500, 'mcg', 'folic acid'),
      r('chromium', 250, 'mcg', 'chromium picolinate'),
      r('selenium', 100, 'mcg', 'selenious acid'),
      r('vitamin-b12', 15, 'mcg', 'cyanocobalamin'),
    ],
    others: [],
    dataFlags: [
      'Five nutrients above one ICMR RDA. This one is at least honestly channelled — the retailer requires a prescription.',
      'A live example of inconsistent classification: this and Becosules are near-equivalent formulations, and one is a prescription drug page while the other is a food-supplement page.',
    ],
  },

  /* ── SECTION 2 · DIRECT-SELLING AND NUTRACEUTICAL BRANDS ───────────────── */
  {
    id: 'nutrilite-daily',
    brand: 'Amway',
    productName: 'Nutrilite Daily',
    manufacturer: 'Amway India Enterprises Pvt. Ltd.',
    marketer: 'Amway India Enterprises Pvt. Ltd., CIN U74120DL1995PTC071405',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '120 tablets',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian; no animal-derived ingredient in the declared list. Vitamin D is ergocalciferol (D2), plant or yeast sourced rather than lanolin — and here the declaration comes from the brand\'s own ingredient statement rather than a retailer panel, so it is not in dispute.',
    fssaiLicence: '10015042002190',
    channel: 'food-otc',
    channelNote: 'Age 12 and over; explicitly not for under-12s, and not for pregnant or lactating women without a physician\'s advice.',
    declaresPctRda: { against: 'ICMR 2020, named explicitly on the label' },
    thirdParty: null,
    price: '₹2,193 / 120 tablets',
    priceInr: 2193,
    retailer: 'Amway',
    url: 'https://www.amway.in/nutrilite-daily/p/313504ID',
    verifiedOn: CHECKED,
    compositionSource: 'brand-label',
    nutrients: [
      r('vitamin-a', 600, 'mcg', 'retinyl acetate'), r('vitamin-c', 40, 'mg', 'L-ascorbic acid'),
      r('vitamin-d', 400, 'IU', 'ergocalciferol — 10 µg as printed'),
      r('vitamin-e', 10, 'mg', 'DL-alpha tocopheryl acetate'), r('vitamin-k', 55, 'mcg', 'phytonadione'),
      r('vitamin-b1', 0.9, 'mg', 'thiamine mononitrate'), r('vitamin-b2', 1.1, 'mg', 'riboflavin'),
      r('vitamin-b6', 1.9, 'mg', 'pyridoxine HCl'), r('vitamin-b12', 1, 'mcg', 'cyanocobalamin'),
      r('vitamin-b3', 11, 'mg', 'nicotinamide'), r('folate', 200, 'mcg DFE', 'folic acid'),
      r('biotin', 25, 'mcg', 'D-biotin'), r('vitamin-b5', 5, 'mg', 'calcium D-pantothenate'),
      r('calcium', 200, 'mg', 'calcium carbonate'), r('iron', 7, 'mg', 'ferrous fumarate'),
      r('phosphorus', 45, 'mg', 'calcium phosphate tribasic'), r('iodine', 140, 'mcg', 'potassium iodide'),
      r('magnesium', 100, 'mg', 'magnesium oxide'), r('zinc', 10, 'mg', 'zinc oxide'),
      r('selenium', 40, 'mcg', 'sodium selenite'), r('copper', 1350, 'mcg', 'cupric gluconate'),
      r('manganese', 2, 'mg', 'manganese sulphate'), r('chromium', 33, 'mcg', 'chromium(III) chloride'),
      r('molybdenum', 45, 'mcg', 'sodium molybdate'),
    ],
    others: [
      { name: 'Nutrilite Concentrate Granular (alfalfa, acerola, spinach, parsley, carrot, watercress, kelp, yeast, electrolytic iron)', amount: null, note: '4.25% of the tablet.' },
      { name: 'Beta-carotene', amount: null, note: 'Declared among the additives as a colour, quantity not stated. It is still beta-carotene.' },
    ],
    dataFlags: [
      'The best-documented label in this survey: the only product publishing both its full premix chemical forms AND a per-nutrient %RDA against a named standard.',
      'CONTAINS BETA-CAROTENE as a colour additive, quantity unstated — the smoker warning applies even though the amount is probably trivial, because "probably trivial" is not the same as known.',
      'Nothing exceeds 100% of RDA by the brand\'s own declaration.',
    ],
  },
  {
    id: 'nutrilite-daily-plus',
    brand: 'Amway',
    productName: 'Nutrilite Daily Plus',
    manufacturer: 'Amway India Enterprises Pvt. Ltd., New Delhi 110025',
    marketer: 'Amway India Enterprises Pvt. Ltd.',
    form: 'bilayer tablet',
    servingsPerDay: 1,
    pack: '30 tablets',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian. Vitamin D declared as D2.',
    fssaiLicence: '10015042002190',
    channel: 'food-otc',
    channelNote: 'Immediate plus extended release bilayer.',
    declaresPctRda: { against: 'ICMR 2020, named explicitly on the label' },
    thirdParty: null,
    price: '₹762.30 / 30 tablets',
    priceInr: 762,
    retailer: 'Amway',
    url: 'https://www.amway.in/nutrilite-daily-plus/p/329863ID',
    verifiedOn: CHECKED,
    compositionSource: 'brand-label',
    nutrients: [
      r('vitamin-a', 840, 'mcg', 'acetate'), r('vitamin-c', 65, 'mg', 'ascorbic acid'),
      r('vitamin-d', 600, 'IU', 'D2 — 15 µg as printed'), r('vitamin-e', 10, 'mg'),
      r('vitamin-k', 55, 'mcg', 'K1'), r('vitamin-b1', 1.4, 'mg', 'thiamine mononitrate'),
      r('vitamin-b2', 1.9, 'mg', 'riboflavin'), r('vitamin-b6', 1.9, 'mg', 'pyridoxine HCl'),
      r('vitamin-b12', 2.2, 'mcg', 'cyanocobalamin'), r('vitamin-b3', 11, 'mg', 'niacinamide'),
      r('folate', 220, 'mcg DFE', 'folic acid'), r('biotin', 35, 'mcg', 'D-biotin'),
      r('vitamin-b5', 5, 'mg', 'calcium D-pantothenate'), r('iron', 19, 'mg', 'ferrous fumarate'),
      r('iodine', 140, 'mcg', 'potassium iodide'), r('zinc', 13.2, 'mg', 'oxide'),
      r('selenium', 40, 'mcg', 'sodium selenite'), r('copper', 1700, 'mcg', 'gluconate'),
      r('manganese', 4, 'mg', 'sulphate'), r('chromium', 50, 'mcg', 'chloride'),
      r('molybdenum', 45, 'mcg', 'sodium molybdate'), r('calcium', 150, 'mg', 'phosphate tribasic'),
      r('phosphorus', 75, 'mg'), r('magnesium', 100, 'mg', 'oxide'),
    ],
    others: [
      { name: 'Gotukola (Centella asiatica) extract', amount: 120, unit: 'mg', note: 'Equivalent to 3.0 g of herb.' },
      { name: 'Acerola powder', amount: null, note: '0.39%' },
      { name: 'Elderberry fruit extract', amount: null, note: '0.39%' },
      { name: 'Purple carrot juice powder', amount: null, note: '0.39%' },
    ],
    dataFlags: [
      'Twenty-one nutrients at exactly 100% of the ICMR requirement and none above. Iron at 19 mg is precisely the adult-male figure. This is the textbook one-RDA formula and the cleanest compliance example in the database.',
      'Iron at a full adult-male RDA in a general-population product is worth naming on the other side of the ledger: a man who is not iron-deficient has no use for it.',
    ],
  },
  {
    id: 'hk-vitals-multivitamin-18',
    brand: 'HK Vitals',
    productName: 'Multivitamin (18+ Essential Nutrients)',
    manufacturer: 'BACFO Pharmaceuticals per HealthKart; Bright Lifecare Private Limited per Truemeds — the two sources disagree',
    marketer: 'Bright Nutricare / Bright Lifecare Pvt Ltd, Gurugram',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '60 tablets',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian. Vitamin D declared as D2.',
    fssaiLicence: '10015064000576',
    channel: 'food-otc',
    channelNote: 'FSSAI licence published on the brand\'s own product page — one of only five in this survey to publish a number.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹399 / 60 tablets',
    priceInr: 399,
    retailer: 'HealthKart',
    url: 'https://www.healthkart.com/sv/healthkart-hk-vitals-multivitamin-with-multimineral/SP-39873',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-c', 65, 'mg', 'ascorbic acid'), r('vitamin-e', 8, 'mg'),
      r('vitamin-b3', 8.25, 'mg'), r('vitamin-b2', 1.9, 'mg'), r('vitamin-b6', 1.43, 'mg', 'pyridoxine'),
      r('vitamin-b1', 1.17, 'mg'), r('vitamin-b5', 0.4, 'mg', 'pantothenic acid'),
      r('vitamin-a', 840, 'mcg'), r('folate', 110, 'mcg', 'folic acid'), r('biotin', 40, 'mcg'),
      r('vitamin-d', 300, 'IU', 'declared D2 — 7.5 µg as printed'), r('vitamin-b12', 2.2, 'mcg', 'cyanocobalamin'),
      r('iron', 12.79, 'mg'), r('magnesium', 7.03, 'mg'), r('manganese', 1.4, 'mg'),
      r('copper', 590, 'mcg'), r('zinc', 5.49, 'mg'), r('iodine', 93.34, 'mcg'),
      r('chromium', 33, 'mcg'), r('selenium', 10, 'mcg'),
    ],
    others: [
      { name: 'Taurine', amount: 500, unit: 'mg' },
      { name: 'Protein hydrolysate', amount: 186.5, unit: 'mg' },
      { name: 'Panax ginseng extract powder', amount: 120, unit: 'mg' },
    ],
    dataFlags: [
      'A taurine-and-ginseng energy product wearing a multivitamin label. Zinc at 32% of the requirement, selenium at 25%, and B5 at 0.4 mg — 8% — which is close to a token inclusion.',
      D2_DISPUTE,
    ],
  },
  {
    id: 'hk-vitals-multivitamin-probiotics',
    brand: 'HK Vitals',
    productName: 'Multivitamin with Probiotics',
    manufacturer: 'Marine Medicare Pvt Ltd, Kulhariwala, Solan, Himachal Pradesh',
    marketer: 'Bright Lifecare Pvt. Ltd., Gurugram',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '60 tablets',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian. Vitamin D declared as D2.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Retailer OTC page. No FSSAI number on the listing.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹419 / 60 tablets',
    priceInr: 419,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/hk-vitals-multivitamin-with-probiotics-for-energy-immunity-gut-health-tablet-otc659880',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 840, 'mcg'), r('vitamin-c', 65, 'mg'), r('vitamin-d', 600, 'IU', 'declared D2 — 15 µg as printed'),
      r('vitamin-e', 9.09, 'mg'), r('vitamin-k', 55, 'mcg', 'K1'), r('vitamin-b1', 1.4, 'mg'),
      r('vitamin-b2', 1.9, 'mg'), r('vitamin-b3', 11, 'mg'), r('vitamin-b5', 5, 'mg'),
      r('vitamin-b6', 1.9, 'mg'), r('folate', 129.41, 'mcg DFE'), r('vitamin-b12', 2.2, 'mcg'),
      r('biotin', 40, 'mcg'), r('iron', 14.5, 'mg'), r('zinc', 13.2, 'mg'),
      r('calcium', 166.7, 'mg'), r('magnesium', 114.26, 'mg'), r('manganese', 4, 'mg'),
      r('copper', 1700, 'mcg'), r('iodine', 140, 'mcg'), r('chromium', 50, 'mcg'),
      r('molybdenum', 45, 'mcg'), r('selenium', 40, 'mcg'),
    ],
    others: [
      { name: 'Boron', amount: 75, unit: 'mcg' },
      { name: 'Panax ginseng root extract', amount: 40, unit: 'mg' },
      { name: 'Fructo-oligosaccharides', amount: 50, unit: 'mg' },
      { name: 'Hadjod (Cissus quadrangularis) extract', amount: 25, unit: 'mg' },
      { name: 'Alfalfa extract', amount: 25, unit: 'mg' },
      { name: 'Ginkgo biloba leaf extract', amount: 20, unit: 'mg' },
      { name: 'Grape seed extract', amount: 20, unit: 'mg' },
      { name: 'Lactobacillus rhamnosus', amount: 0.25, unit: 'billion CFU', note: 'An order of magnitude below typical probiotic dosing.' },
      { name: 'Lutein', amount: 1, unit: 'mcg', note: 'SUSPECT — a microgram is a thousandth of any functional dose. Almost certainly a mis-transcribed unit.' },
      { name: 'Lycopene 10%', amount: 0.5, unit: 'mcg', note: 'SUSPECT — every comparable product doses lycopene in milligrams.' },
    ],
    dataFlags: [
      'A different formula from the 18+ product despite the shared brand — much heavier mineral loading. Do not conflate them.',
      'Its mineral and vitamin values are identical to Carbamide Forte Women on five figures, which strongly suggests a shared contract-manufacturer premix.',
      D2_DISPUTE,
    ],
  },
  {
    id: 'mb-vite',
    brand: 'MuscleBlaze',
    productName: 'MB-Vite Daily Multivitamin',
    manufacturer: 'Zeon Lifesciences Ltd., Paonta Sahib, Sirmaur 173025, Himachal Pradesh',
    marketer: 'Bright Lifecare Pvt. Ltd. (MuscleBlaze), Gurugram 122001',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '60 tablets',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegetarian.',
    fssaiLicence: '10015064000576',
    channel: 'food-otc',
    channelNote: 'Carries a full Indian-format nutrition panel with macros declared — one of the few that do.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹519 / 60 tablets',
    priceInr: 519,
    retailer: 'Nutrabay',
    url: 'https://nutrabay.com/product/muscleblaze-mb-vite-multi-vitamins/?pId=8726119&vId=6980626',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 750, 'mcg'), r('vitamin-c', 40, 'mg'), r('vitamin-d', 200, 'IU', '5 µg as printed'),
      r('vitamin-e', 5, 'mg'), r('vitamin-b2', 1.1, 'mg', 'riboflavin'), r('vitamin-b3', 12, 'mg', 'niacin'),
      r('vitamin-b6', 1, 'mg', 'pyridoxine'), r('vitamin-b12', 1, 'mcg', 'cyanocobalamin'),
      r('folate', 50, 'mcg', 'folic acid'), r('biotin', 30, 'mcg'),
      r('calcium', 110, 'mg'), r('phosphorus', 50, 'mg'), r('iron', 17, 'mg', 'ferrous fumarate'),
      r('zinc', 10, 'mg', 'zinc sulphate monohydrate'), r('magnesium', 3, 'mg', 'magnesium sulphate'),
      r('potassium', 2, 'mg', 'potassium chloride'), r('copper', 1350, 'mcg', 'copper sulphate pentahydrate'),
      r('manganese', 1.4, 'mg', 'manganese sulphate monohydrate'), r('iodine', 100, 'mcg', 'potassium iodide'),
      r('chromium', 33, 'mcg', 'chromium trichloride hexahydrate'), r('selenium', 30, 'mcg', 'sodium selenite'),
      r('molybdenum', 25, 'mcg', 'sodium molybdate'),
    ],
    others: [
      { name: 'Ginkgo biloba leaf extract', amount: 120, unit: 'mg' },
      { name: 'Grape seed extract', amount: 60, unit: 'mg' },
      { name: 'Panax ginseng extract', amount: 42.5, unit: 'mg' },
      { name: 'Choline bitartrate', amount: 10, unit: 'mg' },
      { name: 'Lycopene', amount: 300, unit: 'mcg' },
    ],
    dataFlags: [
      'NO THIAMINE IS DECLARED ANYWHERE on the panel, in a product marketed on "51 ingredients and 6 blends" — and B1 is the canonical energy-metabolism vitamin for a sports multivitamin. That absence is the finding.',
      'Folic acid at 50 mcg is 17% of the requirement.',
      'Iron at 17 mg in a product sold predominantly to men who are not iron-deficient.',
    ],
  },
  {
    id: 'gnc-mega-men-one-daily',
    brand: 'GNC',
    productName: 'Mega Men One Daily (India)',
    manufacturer: MAXCURE,
    marketer: 'Guardian Healthcare Services Pvt Ltd (GNC India)',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '60 tablets',
    demographic: 'adult-men',
    vegetarian: false,
    vegNote: 'NON-VEGETARIAN per the listing. The specific animal-derived component is never identified — only the brown dot. That is a real gap for a citizen who needs to know which one.',
    fssaiLicence: null,
    channel: 'food-otc',
    channelNote: 'Retailer OTC page. No FSSAI number.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹931 / 60 tablets',
    priceInr: 931,
    retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/gnc-mega-men-one-daily-multivitamin-for-muscle-performance-immunity-brain-health-tablet-otc596725',
    verifiedOn: CHECKED,
    compositionSource: 'retailer-panel',
    nutrients: [
      r('vitamin-a', 5000, 'IU', '20% declared as beta-carotene'),
      r('vitamin-c', 40, 'mg'), r('vitamin-d', 400, 'IU', 'D3'), r('vitamin-e', 10, 'mg'),
      r('vitamin-k', 50, 'mcg', 'K2-7, menaquinone-7'), r('vitamin-b1', 1.4, 'mg'),
      r('vitamin-b2', 1.6, 'mg'), r('vitamin-b3', 18, 'mg'), r('vitamin-b5', 5, 'mg'),
      r('vitamin-b6', 2, 'mg'), r('folate', 117, 'mcg', 'folic acid'),
      r('vitamin-b12', 1, 'mcg'), r('biotin', 30, 'mcg'), r('calcium', 400, 'mg'),
      r('iron', 7, 'mg'), r('iodine', 150, 'mcg'), r('magnesium', 125, 'mg'),
      r('zinc', 12, 'mg'), r('selenium', 40, 'mcg'), r('copper', 1350, 'mcg'),
      r('manganese', 2, 'mg'), r('molybdenum', 45, 'mcg'),
      r('chromium', 50, 'mg', null, 'The listing prints "chromium 50 mg". That is a thousandfold overstatement of any reference intake and would be frankly toxic if true. It is certainly a unit error for 50 mcg — but it is carried here as printed and excluded from every total, because a database that quietly repairs its sources hides its own errors.'),
    ],
    others: [
      { name: 'Boron', amount: 2, unit: 'mg' },
      { name: 'L-arginine', amount: 50, unit: 'mg' },
      { name: 'L-glutamine', amount: 50, unit: 'mg' },
      { name: 'Bilberry extract', amount: 50, unit: 'mg' },
      { name: 'Citrus bioflavonoids', amount: 10, unit: 'mg' },
      { name: 'Alpha-lipoic acid', amount: 10, unit: 'mg' },
      { name: 'Pumpkin seed meal extract', amount: 10, unit: 'mg' },
      { name: 'Inositol', amount: 5, unit: 'mg' },
      { name: 'Turmeric root extract', amount: 5, unit: 'mg' },
      { name: 'Resveratrol', amount: 5, unit: 'mg' },
      { name: 'Grape seed extract', amount: 5, unit: 'mg' },
      { name: 'Choline', amount: 2.5, unit: 'mg' },
      { name: 'Lutein', amount: 2, unit: 'mg' },
      { name: 'Lycopene', amount: 2, unit: 'mg' },
      { name: 'Zeaxanthin', amount: 400, unit: 'mcg' },
    ],
    dataFlags: [
      'Vitamin A at 5,000 IU is roughly 1.5 times the ICMR requirement — an American formula imported without restating its doses to the Indian ceiling.',
      'CONTAINS BETA-CAROTENE, and this is the most consequential instance in the database: the carotene fraction is explicitly 20% of a 5,000 IU vitamin A dose, a substantive amount, in a product marketed aggressively to adult men. The smoker contraindication applies and no listing mentions it.',
      'The "chromium 50 mg" figure is a unit error and is excluded from totals.',
    ],
  },
  {
    id: 'swisse-ultivite-mens',
    brand: 'Swisse',
    productName: 'Ultivite Men\'s Multivitamin',
    manufacturer: 'DISPUTED — Nutrabay names LIPA Pharmaceuticals Ltd, Minto NSW, Australia; the other retailer names Vitex Pharmaceuticals Pty Ltd. Both are real Australian contract manufacturers and Swisse uses more than one.',
    marketer: 'Health & Happiness Trading India Pvt. Ltd., Bangalore 560025',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '30 tablets',
    demographic: 'adult-men',
    vegetarian: false,
    vegNote: 'NON-VEGETARIAN — both retailers agree, and neither identifies the component.',
    fssaiLicence: '10019043002879',
    channel: 'food-otc',
    channelNote: 'Imported. FSSAI licence published by one retailer.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹1,104 / 30 tablets',
    priceInr: 1104,
    retailer: 'Nutrabay',
    url: 'https://nutrabay.com/product/swisse-ultivite-mens-multivitamin-supplement-for-relieving-fatigue-tiredness-and-assisting-energy-stamina-vitality-production/?pId=3001341&vId=3740914',
    verifiedOn: CHECKED,
    compositionSource: 'partial',
    nutrients: [
      r('calcium', 120, 'mg'), r('magnesium', 87.5, 'mg'), r('vitamin-c', 40, 'mg'),
      r('vitamin-b3', 14, 'mg', 'niacin'), r('vitamin-e', 10, 'mg'), r('zinc', 7.5, 'mg'),
      r('iron', 5.11, 'mg'), r('vitamin-b5', 5, 'mg'), r('vitamin-b6', 1.9, 'mg'),
      r('manganese', 1.6, 'mg'), r('vitamin-b2', 1.6, 'mg'), r('vitamin-b1', 1.4, 'mg'),
      r('copper', 301, 'mcg'), r('iodine', 50, 'mcg'), r('selenium', 26, 'mcg'),
      r('chromium', 24.86, 'mcg'), r('folate', 117, 'mcg', 'folic acid'),
      r('biotin', 30, 'mcg'), r('vitamin-d', 200, 'IU', 'D3 — 5 µg as printed'), r('vitamin-b12', 1, 'mcg'),
    ],
    others: [
      { name: 'Korean ginseng extract', amount: null, note: 'Declared as equivalent to 1000 mg dry root — the Australian convention, which is not an extract weight.' },
      { name: 'Grape seed extract', amount: null, note: 'Equivalent to 1.19 g.' },
      { name: 'Elderberry extract', amount: null, note: 'Equivalent to 150 mg.' },
      { name: 'Tomato extract with lycopene, ginger extract, papaya powder, amino acids', amount: null, note: 'NO QUANTITY PUBLISHED on either retailer.' },
    ],
    dataFlags: [
      'The micronutrient half is complete; the botanical half is declared in the Australian "equivalent to dry herb" convention and several ingredients carry no quantity at all. Recorded as PARTIAL for that reason.',
      'The two retailers name different manufacturers. Reported rather than resolved.',
    ],
  },
  {
    id: 'wbn-melts-multivitamin',
    brand: 'Wellbeing Nutrition',
    productName: 'melts Multivitamin (oral strips)',
    manufacturer: 'Aavishkar Oral Strips Pvt Ltd, Cherlapally, Hyderabad 500051 — FSSAI 10017047000798',
    marketer: 'Nutritionalab Pvt. Ltd., Lower Parel West, Mumbai 400013',
    form: 'oral strip',
    servingsPerDay: 1,
    pack: '30 strips',
    demographic: 'adult',
    vegetarian: true,
    vegNote: 'Vegan. Vitamin D3 is Vitashine lichen-derived cholecalciferol, explicitly not lanolin. Film base is pullulan, so no gelatin. No fish oil.',
    fssaiLicence: '10019022009134',
    channel: 'food-otc',
    channelNote: 'Two licence numbers published — marketer and manufacturer.',
    declaresPctRda: false,
    thirdParty: 'GMP certified; FDA-registered manufacturing facility; downloadable third-party test reports published on the brand site — the only product in this survey offering certificate-of-analysis-type documentation a buyer can actually open.',
    price: '₹599 / 30 strips',
    priceInr: 599,
    retailer: 'Wellbeing Nutrition',
    url: 'https://wellbeingnutrition.com/products/melts-multivitamin-oral-strips',
    verifiedOn: CHECKED,
    compositionSource: 'brand-label',
    nutrients: [
      r('vitamin-c', 70, 'mg', 'ascorbic acid + sodium ascorbate'),
      r('vitamin-b5', 5, 'mg', 'calcium pantothenate'), r('vitamin-b2', 2.5, 'mg', 'riboflavin'),
      r('vitamin-b6', 2.4, 'mg', 'pyridoxine hydrochloride'), r('vitamin-b1', 1.8, 'mg', 'thiamine hydrochloride'),
      r('vitamin-a', 1000, 'mcg', 'retinyl palmitate'), r('folate', 300, 'mcg DFE', 'folic acid'),
      r('iodine', 140, 'mcg', 'potassium iodide'), r('vitamin-k', 55, 'mcg', 'MenaquinGold natural MK-7'),
      r('biotin', 40, 'mcg', 'D-biotin'), r('vitamin-b12', 2.2, 'mcg', 'cyanocobalamin'),
      r('vitamin-d', 600, 'IU', 'Vitashine vegan cholecalciferol from lichen'),
    ],
    others: [
      { name: 'Ashwagandha (Withania somnifera)', amount: 20, unit: 'mg' },
      { name: 'Korean ginseng (Panax ginseng)', amount: 10, unit: 'mg' },
    ],
    dataFlags: [
      'Seven nutrients at exactly the ICMR adult-male requirement and none above — the third product in this survey visibly formulated to the statutory ceiling.',
      'CONTAINS NO MINERALS other than iodine. No iron, calcium, zinc, magnesium or selenium — a real limitation of the oral-strip format that "complete multivitamin" marketing does not convey.',
      'Marketing claims "100% RDA" while publishing no per-nutrient percentage and naming no reference standard.',
    ],
  },

  /* ── SECTION 3 · PARTIAL ───────────────────────────────────────────────── */
  {
    id: 'carbamide-forte-women',
    brand: 'Carbamide Forte',
    productName: 'Multivitamin for Women with Probiotics',
    manufacturer: 'Influx Healthtech Limited, Palghar, Maharashtra',
    marketer: 'Novus Life Sciences Pvt. Ltd., Mumbai 400053',
    form: 'tablet',
    servingsPerDay: 1,
    pack: '60 tablets',
    demographic: 'adult-women',
    vegetarian: true,
    vegNote: '100% vegetarian. Vitamin D declared as D2.',
    fssaiLicence: '10021022000275',
    channel: 'food-otc',
    channelNote: 'FSSAI licence published on the brand\'s own site.',
    declaresPctRda: false,
    thirdParty: null,
    price: '₹399 / 60 tablets',
    priceInr: 399,
    retailer: 'brand store',
    url: 'https://mycf.in/products/carbamide-forte-multivitamins-for-womens-with-probiotics-and-minerals-supplement-containing-43-ingredients-8-vital-blends-60-veg-tablets',
    verifiedOn: CHECKED,
    compositionSource: 'partial',
    nutrients: [
      r('vitamin-a', 840, 'mcg'), r('vitamin-c', 65, 'mg'), r('vitamin-d', 600, 'IU', 'declared D2 — 15 µg as printed'),
      r('vitamin-e', 10, 'mg'), r('vitamin-k', 55, 'mcg', 'K2'), r('iron', 14.5, 'mg'),
      r('zinc', 13.2, 'mg'), r('calcium', 90, 'mg'), r('magnesium', 50, 'mg'),
    ],
    others: [
      { name: 'B-complex, B1 to B12', amount: null, note: 'Declared as present. NO AMOUNTS PUBLISHED — eight nutrients missing.' },
      { name: 'Probiotic blend — L. acidophilus, L. rhamnosus, B. longum, S. boulardii', amount: null, note: 'Listed as "250 CFU each" on one retailer, which is missing the word million; the brand\'s own page says 250 million CFU across four strains.' },
      { name: 'Ginseng, ashwagandha, turmeric, moringa, amla, green tea', amount: null, note: 'NO AMOUNTS PUBLISHED.' },
    ],
    dataFlags: [
      'PARTIAL: eight B-vitamin amounts and six herbal amounts are missing. The brand claims "100% RDA" and "43 ingredients" while publishing neither percentages nor a reference standard.',
      'Its mineral and vitamin values match HK Vitals Multivitamin with Probiotics on five figures — almost certainly the same contract-manufacturer premix wearing two brands.',
      D2_DISPUTE,
    ],
    unknownBecause: 'A photograph of the back-of-pack nutrition panel would supply the missing B-vitamin and herbal quantities.',
  },
];

/* ── SECTION 4 · NAMED, AND NOT DESCRIBED ───────────────────────────────────
   Eleven products that really sell in India and whose composition could not be
   verified anywhere reachable. They are here rather than absent because "we
   could not find out what is in this" is a finding about the market, and one
   the reader is owed before they buy. The retailer house brands are the worst
   of it: Tata 1mg is the single best source of composition data for other
   people's products in this entire survey, and publishes nothing quantified
   about its own two.

   `unknownBecause` on every one of them names what would settle it, and the
   spec asserts that it is never blank. */

const unknown = (
  o: Pick<Formulation, 'id' | 'brand' | 'productName' | 'form' | 'servingsPerDay' | 'demographic' | 'vegetarian' | 'vegNote' | 'fssaiLicence' | 'retailer' | 'url' | 'unknownBecause'> &
    Partial<Pick<Formulation, 'manufacturer' | 'marketer' | 'pack' | 'price' | 'priceInr' | 'dataFlags' | 'others'>>,
): Formulation => ({
  manufacturer: null, marketer: null, pack: 'UNKNOWN', price: null, priceInr: null,
  channel: 'food-otc', channelNote: 'Sold on retailer supplement pages.',
  declaresPctRda: false, thirdParty: null, verifiedOn: CHECKED,
  compositionSource: 'UNKNOWN', nutrients: [], others: [], dataFlags: [],
  ...o,
});

export const UNVERIFIED: Formulation[] = [
  unknown({
    id: 'himalayan-organics-multivitamin', brand: 'Himalayan Organics',
    productName: 'Multivitamin with Probiotics', form: 'tablet', servingsPerDay: 1,
    manufacturer: 'Vlado Sky Enterprise Pvt. Ltd., Vijaynagar, Indore 452010',
    pack: '180 tablets', price: '₹728 / 180 tablets', priceInr: 728,
    demographic: 'adult', vegetarian: true, vegNote: 'Vegetarian.',
    fssaiLicence: '11420850000150', retailer: 'brand store',
    url: 'https://www.thehimalayanorganics.in/products/himalayan-organics-multivitamin-for-men-women-with-40-ingredients-180-tablets',
    dataFlags: ['Marketed as "100+ ingredients" in seven named blends, and NOT ONE QUANTITY is published for any of them, on the brand\'s own site or on any retailer.', 'The same product is sold as "45 ingredients", "60 ingredients" and "100+ ingredients" across different listings. That inconsistency is itself a label-reliability warning.'],
    unknownBecause: 'A photograph of the back-of-pack supplement facts panel. Nothing quantified is published anywhere reachable.',
  }),
  unknown({
    id: 'mankind-health-ok', brand: 'Mankind Pharma', productName: 'Health OK',
    form: 'film-coated tablet', servingsPerDay: 1,
    manufacturer: 'Mankind Pharma Pvt Ltd, Okhla Industrial Estate Phase 3, New Delhi 110020',
    pack: '30 tablets', price: '₹219.80 / 30 tablets', priceInr: 220,
    demographic: 'adult', vegetarian: true, vegNote: '100% vegetarian.',
    fssaiLicence: null, retailer: 'PharmEasy',
    url: 'https://pharmeasy.in/health-care/products/mankind-health-ok-multi-vitamin-multimineral-with-ginseng-immunity-and-mental-alertness-30-tablets-3611365',
    dataFlags: ['Publishes an ingredient list as PERCENTAGES OF TABLET MASS rather than as amounts — taurine 43.20%, vitamin C 4.15%, ginseng 3.7%, zinc sulphate 1.18%, vitamin D 0.22%. A percentage of a tablet is not a dose.', 'Claims 12 vitamins and 7 minerals; names forms without amounts.'],
    unknownBecause: 'A photograph of the label, or a retailer panel that publishes amounts rather than mass fractions. A high-volume mass brand with no published dose.',
  }),
  unknown({
    id: 'fastandup-vitalize', brand: 'Fast&Up', productName: 'Vitalize (effervescent)',
    form: 'effervescent', servingsPerDay: 1, pack: '20 tablets',
    demographic: 'adult', vegetarian: true, vegNote: 'Vegetarian.',
    fssaiLicence: '10020022011847', retailer: 'brand store',
    url: 'https://in.fastandup.com/products/vitalize-multivitamin-single-tube',
    dataFlags: ['The nutrition table is published only as an IMAGE, so no machine and no screen reader can read it. Sports-marketed and carries no third-party sport certification.'],
    unknownBecause: 'The published nutrition table exists but only as a picture. Transcription from that image, or a label photograph, would settle it.',
  }),
  unknown({
    id: 'plix-super-multi-vitamin', brand: 'Plix', productName: 'Super Multi Vitamin Bubbly',
    form: 'effervescent', servingsPerDay: 1, demographic: 'adult',
    vegetarian: true, vegNote: '100% vegetarian.', fssaiLicence: null, retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/plix-super-multi-vitamin-bubbly-effervescent-tablet-orange-otc903735',
    dataFlags: ['Claims "100% RDA" in marketing copy and publishes no percentage of anything against any standard. A claim of 100% with no denominator is not a claim.'],
    unknownBecause: 'No quantified composition is published on any retailer or on the brand\'s own store.',
  }),
  unknown({
    id: 'siens-dabur-men', brand: 'Dabur', productName: 'Siens by Dabur Multivitamin for Men',
    form: 'tablet', servingsPerDay: 1, demographic: 'adult-men',
    vegetarian: true, vegNote: 'Vegetarian.', fssaiLicence: null, retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/siens-by-dabur-multivitamin-tablet-for-men-34-nutrients-to-support-energy-stamina-tablet-otc1061006',
    dataFlags: ['Marketed on "34 nutrients". Publishes its EXCIPIENTS and not its nutrients.'],
    unknownBecause: 'No nutrient quantities published anywhere. A label photograph would settle it.',
  }),
  unknown({
    id: 'tata-1mg-daily-multivitamin', brand: 'Tata 1mg', productName: 'Daily Multivitamin (house brand)',
    form: 'capsule', servingsPerDay: 2, manufacturer: 'BACFO Pharmaceuticals',
    demographic: 'adult', vegetarian: null, vegNote: 'UNKNOWN.',
    fssaiLicence: null, retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/daily-multivitamin-capsule-with-13-vitamins-9-minerals-probiotics-botanicals-energy-immunity-support-by-tata-1mg-otc1120530',
    dataFlags: ['Two capsules a day, so any composition eventually published must be doubled before it means anything.', 'The retailer that publishes the best composition panels in India for other people\'s products publishes nothing quantified for its own.'],
    unknownBecause: 'The house brand publishes no quantified composition. Its own platform is the source everything else in this database was read from.',
  }),
  unknown({
    id: 'tata-1mg-multivitamin-supreme', brand: 'Tata 1mg', productName: 'Multivitamin Supreme (house brand)',
    form: 'capsule', servingsPerDay: 1, manufacturer: MAXCURE,
    demographic: 'adult', vegetarian: false, vegNote: 'NON-VEGETARIAN — gelatin capsule.',
    fssaiLicence: null, retailer: 'Tata 1mg',
    url: 'https://www.1mg.com/otc/multivitamin-supreme-capsules-with-probiotics-for-immunity-energy-overall-health-by-tata-1mg-otc503409',
    unknownBecause: 'No quantified composition published by the retailer that sells it.',
  }),
  unknown({
    id: 'pharmeasy-mvmm', brand: 'PharmEasy', productName: 'Multivitamin Multimineral (house brand)',
    form: 'tablet', servingsPerDay: 1, manufacturer: 'BACFO Pharmaceuticals',
    pack: '60 tablets', demographic: 'adult', vegetarian: null, vegNote: 'UNKNOWN.',
    fssaiLicence: null, retailer: 'PharmEasy',
    url: 'https://pharmeasy.in/health-care/products/pharmeasy-multivitamin-multimineral---pack-of-60-3491142',
    dataFlags: ['Same contract manufacturer as the Tata 1mg house brand. Two competing retailers\' own-label multivitamins made in the same plant, neither publishing a composition.'],
    unknownBecause: 'No quantified composition published.',
  }),
  unknown({
    id: 'netmeds-supermeds-women', brand: 'Netmeds', productName: 'Supermeds Multivitamin Women',
    form: 'tablet', servingsPerDay: 1, pack: '60 tablets',
    demographic: 'adult-women', vegetarian: null, vegNote: 'UNKNOWN.',
    fssaiLicence: null, retailer: 'Netmeds',
    url: 'https://www.netmeds.com/product/supermeds-multivitamin-women-tablet-60s-n-m3pre8-8642054',
    dataFlags: ['The product page publishes a name and a price and nothing else.'],
    unknownBecause: 'Nothing beyond name and price is published.',
  }),
  unknown({
    id: 'gnc-womens-one-daily', brand: 'GNC', productName: 'Women\'s One Daily / Ultra Mega (India)',
    form: 'tablet', servingsPerDay: 1, manufacturer: MAXCURE,
    demographic: 'adult-women', vegetarian: false, vegNote: 'NON-VEGETARIAN; component not identified.',
    fssaiLicence: '10016011003870', retailer: 'Nutrabay',
    url: 'https://nutrabay.com/product/gnc-womens-ultra-mega-one-daily-caplets/?pId=1342807&vId=1732181',
    dataFlags: ['Do not read the Mega Men composition onto this. A men\'s and a women\'s formula differ on iron, and that difference is the entire point of selling two.'],
    unknownBecause: 'No quantified Indian composition published. The US formula is a different product and must not be substituted.',
  }),
  unknown({
    id: 'natures-bounty-kapiva-baidyanath', brand: 'Nature\'s Bounty / Kapiva / Baidyanath',
    productName: 'No verifiable Indian multivitamin SKU', form: 'tablet', servingsPerDay: 1,
    demographic: 'adult', vegetarian: null, vegNote: 'UNKNOWN.',
    fssaiLicence: null, retailer: 'various',
    url: 'https://www.1mg.com/marketer/nature-s-bounty-74751',
    dataFlags: ['Three brands checked because they are frequently named in Indian multivitamin round-ups. No Indian-labelled multivitamin SKU with a published composition was found for any of them, and Kapiva appears not to sell one at all.'],
    unknownBecause: 'No Indian label found. A brand being famous is not a product existing.',
  }),
];

/** Every formulation, verified and not. The engine reasons over this; the
 *  screen is expected to show the difference. */
export const ALL_FORMULATIONS: Formulation[] = [...FORMULATIONS, ...UNVERIFIED];

export const formulation = (id: string): Formulation => {
  const f = ALL_FORMULATIONS.find((x) => x.id === id);
  if (!f) throw new Error(`formulation not in the label database: ${id}`);
  return f;
};

/**
 * WHAT THE SURVEY FOUND ABOUT THE CATEGORY, rather than about any one product.
 * Kept here so a screen can say it without a session inventing it afresh.
 */
export const CATEGORY_FINDINGS: Array<{ finding: string; detail: string }> = [
  {
    finding: 'Exceedances of the one-RDA ceiling cluster entirely in legacy pharma B-complex products.',
    detail: 'Five of thirty-two — Supradyn Daily, Becosules, Neurobion Forte, Cobadex CZS and GNC Mega Men One Daily. Four are old pharma formulations sold through consumer channels; the fifth is an American formula imported without restating its doses. Every Indian-designed nutraceutical in this database sits at or below the ceiling. The cap is being observed by the food-category players and ignored by the drug-category ones.',
  },
  {
    finding: 'One brand in thirty-two publishes a per-nutrient percentage against a named standard.',
    detail: 'Amway, on both its products, against ICMR 2020. Centrum Women publishes percentages without naming what they are percentages of. Several brands claim "100% RDA" in marketing while publishing no percentages at all. This is the single largest transparency gap in the category.',
  },
  {
    finding: 'Vitamin D is declared as D2 across a large part of the market, and nobody discusses it.',
    detail: 'Nine products in this survey show D2 on their composition panel. D2 is yeast-derived and permits a green vegetarian dot; D3 is usually lanolin and would not. If the declarations are real this is a deliberate market-wide vegetarian-compliance strategy with a real clinical cost, because D2 raises 25(OH)D less efficiently. If they are retailer data errors then a large fraction of India\'s published vitamin D data is wrong. Only Zincovit and the melts strips declare a lichen D3 explicitly.',
  },
  {
    finding: 'Contract-manufacturer concentration makes brand differentiation largely a marketing exercise.',
    detail: 'One Haridwar plant makes Centrum Men, Centrum Women, Centrum 50+, Revital Woman, both GNC products and a Tata 1mg house brand — three nominally competing brands and a retailer own-label. One other plant makes both the Tata 1mg and PharmEasy house brands. HK Vitals with Probiotics and Carbamide Forte Women share five identical values.',
  },
  {
    finding: 'Retailer house brands are the least transparent segment of the market.',
    detail: 'Tata 1mg (two products), PharmEasy and Netmeds publish zero quantified composition — while 1mg\'s own platform is the best source of composition data for every other brand in this survey.',
  },
  {
    finding: 'Certification claims are thin, including on the sports products.',
    detail: 'One product in thirty-two publishes downloadable third-party test reports. No product carries Informed-Sport, NSF or USP verification, including the two sold specifically to athletes.',
  },
  {
    finding: 'Non-vegetarian status is under-declared.',
    detail: 'Five products are confirmed non-vegetarian and four of those never identify the animal source — only a brown dot. Neurobion Forte carries gelatin as its B12 carrier and no veg declaration at all. Becosules and Supradyn Daily state nothing either way.',
  },
];
