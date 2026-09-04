#!/usr/bin/env node
/**
 * scripts/gen-beauty-catalog.mjs — the shelf, from the owner's data sheet.
 *
 * WHY THIS FILE EXISTS AT ALL. beauty-catalog.ts has said since the seventy-row
 * shelf landed that it "IS GENERATED FROM THE OWNER'S DATA SHEET, AND EDITED BY
 * HAND AFTERWARDS IS A MISTAKE… the next sheet should be re-run through the same
 * derivation rather than diffed against this file." The derivation was never
 * committed. It lived in a session, was described in prose in two landing
 * scripts, and by the time the third sheet arrived it existed nowhere that could
 * be run. So the instruction was unfollowable: the only way to add products was
 * the hand-editing the file forbids.
 *
 * Now it is a script, and re-running it is the supported way to grow the shelf.
 *
 * ── IT APPENDS. IT DOES NOT REWRITE. ────────────────────────────────────────
 *
 * Every row already in beauty-catalog.ts is emitted byte-identical, and rows the
 * sheet does not mention are KEPT. That is not caution for its own sake:
 *
 *   · The five derived fields have been corrected by hand-review three times —
 *     a retinol serum scheduled for the morning, caffeine putting `hair-density`
 *     on a face cream, four products with no `profileKeys` at all. Regenerating
 *     an already-reviewed row throws that review away and re-runs the same
 *     keyword derivation that produced the defects.
 *   · This sheet is NOT a superset. It carries 170 rows; 70 of them are already
 *     on the shelf and 56 shelf products are absent from it. Treating the sheet
 *     as the shelf would silently delete a fifth of the catalogue, including
 *     products the specs pin by name.
 *
 * Price, tier and blurb were compared across all 70 overlapping rows before this
 * was written and are identical in both, so "keep the existing row" costs no
 * freshness. If a future sheet moves a price, that is a real diff and this
 * script will report it rather than apply it — see REPRICED below.
 *
 * ── THE FIVE DERIVATIONS, WHICH ARE JUDGEMENTS AND NOT FACTS ────────────────
 *
 * The sheet carries brand, name, price, tier, skin/hair type, ingredients,
 * benefits, two photographs and a product page. The engine needs five more —
 * `category`, `usage`, `suitableSkin`, `profileKeys`, `tags` — and they are
 * derived here from keyword rules over marketing copy, which fails QUIETLY: it
 * never throws, it produces something plausible and wrong. Two defences:
 *
 *   1. `--check` replays the derivation against the 70 rows already reviewed and
 *      prints per-field agreement. Run it before trusting a new sheet.
 *   2. catalog-is-shoppable.spec.ts checks the WHOLE emitted catalogue and names
 *      offenders by id.
 *
 * Usage:
 *   node scripts/gen-beauty-catalog.mjs --sheet scripts/beauty-sheet.json --check
 *   node scripts/gen-beauty-catalog.mjs --sheet scripts/beauty-sheet.json --write
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = resolve(HERE, '../src/beauty/beauty-catalog.ts');
const SNAPSHOT = resolve(HERE, '../.catalog-snapshot.json');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

// ── the sheet's category vocabulary → the shelf's display category ──────────
// Sixteen to sixteen, recovered by comparing every one of the 70 overlapping
// rows. An unmapped category is a hard stop rather than a guess: the display
// category drives the routine ROLE, the monthly dose and the application order,
// and a product filed under the wrong one is a shampoo in the skincare tab.
const CATEGORY = {
  'Face Cleanser/Face Wash': 'Cleanser',
  'Toner': 'Toner',
  'Face Serum': 'Serum',
  'Moisturizer': 'Moisturiser',
  'Sunscreen': 'Sunscreen',
  'Face Mask': 'Face mask',
  'Shampoo': 'Shampoo',
  'Conditioner': 'Conditioner',
  'Hair Mask': 'Hair mask',
  'Hair Oil': 'Hair oil',
  'Hair Serum/Leave-in': 'Hair serum',
  'Body Wash/Shower Gel': 'Body wash',
  'Body Lotion/Moisturizer': 'Body lotion',
  'Body Scrub': 'Body scrub',
  'Hand Cream': 'Hand cream',
  'Lip Balm': 'Lip balm',
};

/**
 * ── THE 2026-08 SHEET SPEAKS THE SHELF'S OWN VOCABULARY ─────────────────────
 *
 * The three sheets before it came from one retailer's export and used that
 * retailer's sixteen category names, which `CATEGORY` above translates. The
 * 2026-08 sheet is assembled from twenty-nine brands' own storefronts and has
 * no single vendor vocabulary to inherit, so the mapping was done upstream and
 * it arrives already speaking the shelf's terms. These are those terms — the
 * original sixteen, plus what a catalogue eight times the size actually
 * contains and the old one had no word for.
 *
 * THE THREE NEW GROUPS ARE NOT ROUTINE GROUPS. Skincare, Hair Care and Body
 * Care are bands of a routine; Makeup, Fragrance and Tools are things you buy.
 * A perfume does not answer a finding in a skin assessment and a beard trimmer
 * is not a step. They are on the shelf because the citizen shops for them, and
 * they are kept out of the routine by `ROUTINE_GROUPS` in routine-engine.ts
 * rather than by giving them a reading key they do not earn.
 */
const SELF_CATEGORIES = new Set([
  // Skincare
  'Cleanser', 'Toner', 'Serum', 'Moisturiser', 'Night cream', 'Eye cream',
  'Sunscreen', 'Face mask', 'Face scrub', 'Face oil', 'Facial kit', 'Lip care',
  // Hair Care
  'Shampoo', 'Dry shampoo', 'Conditioner', 'Hair mask', 'Hair oil', 'Hair serum',
  'Scalp treatment', 'Hair colour', 'Hair treatment', 'Hair styling',
  'Hair extensions', 'Hair kit',
  // Body Care
  'Body wash', 'Body lotion', 'Body scrub', 'Body mask', 'Body oil', 'Hand cream',
  'Lip balm', 'Foot care', 'Soap', 'Hair removal',
  // Makeup
  'Lipstick', 'Lip gloss', 'Lip liner', 'Foundation', 'Concealer', 'Compact',
  'Blush', 'Highlighter', 'Kajal', 'Eyeliner', 'Mascara', 'Eyeshadow', 'Brow',
  'Primer', 'Nail', 'Makeup kit',
  // Fragrance
  'Perfume', 'Body mist', 'Deodorant', 'Attar',
  // Tools
  'Trimmer', 'Shaver', 'Hair dryer', 'Hair straightener', 'Hair styler',
  'Epilator', 'Grooming tool',
]);

/** When it is used, by category — then two overrides, and the ORDER MATTERS. */
const USAGE = {
  Cleanser: 'Morning & Night', Toner: 'Morning & Night', Serum: 'Morning & Night',
  Moisturiser: 'Morning & Night', Sunscreen: 'Morning', 'Face mask': 'Weekly',
  Shampoo: 'Weekly', Conditioner: 'Weekly', 'Hair mask': 'Weekly', 'Hair oil': 'Weekly',
  'Hair serum': 'Night',
  'Body wash': 'Body', 'Body lotion': 'Body', 'Body scrub': 'Body',
  'Hand cream': 'Body', 'Lip balm': 'Body',

  // ── added with the 2026-08 sheet ──
  'Night cream': 'Night', 'Eye cream': 'Morning & Night', 'Face scrub': 'Weekly',
  'Face oil': 'Night', 'Facial kit': 'Weekly', 'Lip care': 'Morning & Night',
  'Dry shampoo': 'Weekly', 'Scalp treatment': 'Night', 'Hair colour': 'Weekly',
  'Hair treatment': 'Weekly', 'Hair styling': 'Morning', 'Hair extensions': 'Morning',
  'Hair kit': 'Weekly',
  'Body mask': 'Body', 'Body oil': 'Body', 'Foot care': 'Body', 'Soap': 'Body',
  'Hair removal': 'Body',
  // Makeup, fragrance and tools are not routine steps. They still need a legal
  // usage string because the field is not optional; 'Morning' is where a shop
  // browser sorts them and no routine ever reads it, because ROUTINE_GROUPS
  // stops them long before slotsFor() is called.
  Lipstick: 'Morning', 'Lip gloss': 'Morning', 'Lip liner': 'Morning',
  Foundation: 'Morning', Concealer: 'Morning', Compact: 'Morning', Blush: 'Morning',
  Highlighter: 'Morning', Kajal: 'Morning', Eyeliner: 'Morning', Mascara: 'Morning',
  Eyeshadow: 'Morning', Brow: 'Morning', Primer: 'Morning', Nail: 'Morning',
  'Makeup kit': 'Morning',
  Perfume: 'Morning', 'Body mist': 'Morning', Deodorant: 'Morning', Attar: 'Morning',
  Trimmer: 'Weekly', Shaver: 'Morning', 'Hair dryer': 'Weekly',
  'Hair straightener': 'Weekly', 'Hair styler': 'Weekly', Epilator: 'Weekly',
  'Grooming tool': 'Weekly',
};

const RETINOID = /retinol|retinal|retinaldehyde|retinyl|retinoid|tretinoin|adapalene/i;
const VITAMIN_C = /vitamin c|ascorb/i;

const SKIN_TYPES = ['dry', 'oily', 'combination', 'normal', 'sensitive'];

/** Ingredient/benefit words → the assessment reading keys they answer. */
const PROFILE_WORDS = {
  acne: /acne|breakout|blemish|pimple|blackhead|whitehead|salicylic|benzoyl|azelaic|tea tree|sebum-regulat/i,
  oil: /oil control|oily|excess sebum|sebum|mattif|shine control|oil-free|oil free|non-comedogenic|non-greasy|pore-clear|lightweight|ultra-light|light fluid|gel texture|weightless/i,
  texture: /texture|pore|smooth|exfoliat|refin|polish|glycolic|lactic|mandelic|aha|pha|resurfac|dead skin/i,
  hydration: /hydrat|moistur|hyaluronic|glycerin|ceramide|squalane|barrier|dry|nourish|shea|urea|plump|dewy/i,
  pigmentation: /brighten|bright|pigment|dark spot|even tone|even skin tone|radian|glow|vitamin c|ascorb|alpha arbutin|kojic|tranexamic|thiamidol|melasma|de-tan|tanning|dull|uv|spf|sun damage|photo-?age/i,
  wrinkles: /fine line|wrinkle|anti-ageing|anti-aging|firm|elasticity|collagen|retinol|retinal|peptide|bakuchiol|sagging/i,
  redness: /redness|sooth|calm|sensitiv|irritat|centella|cica|allantoin|panthenol|madecassoside|rosacea|fragrance-free|gentle/i,
  scalp: /scalp|dandruff|flake|itch|ketoconazole|zinc pyrithione|piroctone|sebum.*scalp|oily scalp/i,
  density: /hair fall|hairfall|hair loss|thinning|density|redensyl|minoxidil|growth|regrowth|onion|bhringraj|bringharaj/i,
  damage: /damage|breakage|split end|frizz|repair|bond|keratin|protein|smooth.*hair|colour|color-treated|heat protect|shine/i,
  thickness: /volumis|volumiz|volume|thicken|fine hair|body.*hair|biotin/i,
};

/**
 * ── FACIAL HAIR IS NOT THE HAIR ON YOUR HEAD ────────────────────────────────
 *
 * `density`'s rule below matches "growth" and "regrowth", and a beard growth
 * oil is a hair-care product that promotes growth — so six Ustraa beard SKUs
 * came out of this derivation carrying `density`, the key that means SCALP hair
 * density. They were five of the ten Hair Care products under ₹1,000 carrying
 * it, so "best hair-fall product under ₹500" answered **Beard Growth Oil at a
 * match score of 85**.
 *
 * Nothing in the data was false. The row simply had no way to say which hair it
 * was about. `site` is that way; it is emitted only where it differs from the
 * group's default (product-site.ts resolves the default), so this shows up as
 * fourteen changed rows rather than 1,841.
 *
 * SCOPED TO HAIR CARE ON PURPOSE. Lotus Professional's "Face And Beard Wash" is
 * a Skincare row and claims face keys; it is a face wash that is also fine on a
 * beard, not a beard product, and reclassifying it would be the same category
 * error in the other direction.
 */
const FACIAL_HAIR = /\bbeard\b|\bbeards\b|moustache|mustache|\bmooch\b|stubble/i;
const SCALP_KEYS = new Set(['scalp', 'density', 'thickness', 'hairline']);
const SCALP_TAGS = new Set(['scalp', 'hair-density']);
const siteFor = (group, name) =>
  (group === 'Hair Care' && FACIAL_HAIR.test(name)) ? 'beard' : undefined;

/** Which keys a group may claim. A face cream cannot have an opinion about a scalp. */
const KEYS_FOR_GROUP = {
  Skincare: ['acne', 'oil', 'texture', 'hydration', 'pigmentation', 'wrinkles', 'redness'],
  'Hair Care': ['scalp', 'density', 'damage', 'thickness'],
  'Body Care': ['hydration', 'texture', 'redness'],

  /**
   * MAKEUP GETS THE THREE FACE KEYS IT CAN HONESTLY EARN, AND ONLY WHEN ITS OWN
   * COPY SAYS SO. A mattifying compact really does answer `oil`; a colour-
   * correcting concealer really does answer `pigmentation`; a tinted balm
   * really does answer `hydration`. What it must never get is `acne` or
   * `wrinkles` — coverage is not treatment, and a foundation that "blurs fine
   * lines" is describing an optical effect, not a finding it resolves.
   *
   * FRAGRANCE AND TOOLS GET NOTHING, ON PURPOSE. There is no reading in a skin
   * and hair assessment that a perfume or a beard trimmer answers, and the
   * shelf has a rule that no product may have an empty `profileKeys` because an
   * empty list is a silent deletion. That rule was written when every product
   * on the shelf was a treatment product. It is now scoped to the three routine
   * groups in catalog-is-shoppable.spec.ts, because the alternative — handing a
   * perfume `hydration` so it clears a guard — puts a false claim in the data
   * to make a test go green, and the engine would then recommend it for dry
   * skin. An empty list here means exactly what it says: this is browsed, not
   * matched. It still sells; it is never prescribed.
   */
  Makeup: ['oil', 'pigmentation', 'hydration'],
  Fragrance: [],
  Tools: [],
};

/** Where nothing matched, the category still says something true. Never empty:
 *  a product with no profileKeys scores zero for everybody, for ever — on the
 *  shelf, unreachable, and nothing reporting it. */
const KEY_FALLBACK = {
  Cleanser: ['oil'], Toner: ['texture'], Serum: ['hydration'], Moisturiser: ['hydration'],
  Sunscreen: ['pigmentation'], 'Face mask': ['texture'],
  Shampoo: ['scalp'], Conditioner: ['damage'], 'Hair mask': ['damage'], 'Hair oil': ['scalp'],
  'Hair serum': ['damage'],
  'Body wash': ['hydration'], 'Body lotion': ['hydration'], 'Body scrub': ['texture'],
  'Hand cream': ['hydration'], 'Lip balm': ['hydration'],

  // ── added with the 2026-08 sheet ──
  'Night cream': ['hydration'], 'Eye cream': ['hydration'], 'Face scrub': ['texture'],
  'Face oil': ['hydration'], 'Facial kit': ['texture'], 'Lip care': ['hydration'],
  'Dry shampoo': ['scalp'], 'Scalp treatment': ['scalp'], 'Hair colour': ['damage'],
  'Hair treatment': ['damage'], 'Hair styling': ['damage'], 'Hair extensions': ['thickness'],
  'Hair kit': ['damage'],
  'Body mask': ['texture'], 'Body oil': ['hydration'], 'Foot care': ['hydration'],
  Soap: ['hydration'], 'Hair removal': ['texture'],
  // Makeup falls back to nothing rather than to a key. A lipstick whose copy
  // never mentions hydration is not a hydrating product, and the fallback here
  // exists to stop a TREATMENT going unreachable, not to give cosmetics a claim.
};

/** Biomarker tags — the SECONDARY signal, and only ever added on top of a
 *  profile match. Gated by group, and `spf` only ever to a sunscreen. */
const TAG_WORDS = {
  barrier: /ceramide|barrier|lipid|panthenol|centella|cica|squalane/i,
  hydration: /hydrat|hyaluronic|glycerin|moistur|dewy|plump/i,
  brightening: /brighten|bright|pigment|dark spot|even tone|radian|glow|vitamin c|ascorb|arbutin|kojic|thiamidol|dull|de-tan|tanning|luminous/i,
  antioxidant: /antioxidant|vitamin c|vitamin e|ferulic|green tea|resveratrol|polyphenol|free radical/i,
  collagen: /collagen|peptide|firm|elasticity|retinol|retinal|bakuchiol/i,
  soothing: /sooth|calm|anti-inflammat|redness|centella|cica|allantoin|madecassoside|aloe|sensitive|irritat|gentle|non-irritating|comfort/i,
  spf: /spf|sun protect|uva|uvb|broad.spectrum/i,
  scalp: /scalp|dandruff|follicle|ketoconazole|pyrithione|piroctone/i,
  'hair-density': /hair fall|hairfall|density|redensyl|caffeine|regrowth|thinning|biotin/i,
};
const TAGS_FOR_GROUP = {
  Skincare: ['barrier', 'hydration', 'brightening', 'antioxidant', 'collagen', 'soothing', 'spf'],
  'Hair Care': ['scalp', 'hair-density', 'hydration', 'antioxidant'],
  'Body Care': ['barrier', 'hydration', 'soothing', 'antioxidant'],
  // Tags are the biomarker signal and only ever ADD to an existing profile
  // match. With no profile keys, Fragrance and Tools can never have one to add
  // to, so a tag on them would be dead weight that still had to be maintained.
  Makeup: ['hydration', 'brightening', 'soothing'],
  Fragrance: [],
  Tools: [],
};

/** The three bands of a routine. Everything else on the shelf is shop-only. */
const ROUTINE_GROUPS = new Set(['Skincare', 'Hair Care', 'Body Care']);

// ── helpers ────────────────────────────────────────────────────────────────

const deaccent = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
const stripPack = (s) => s.replace(/\s*\([\d.]+\s*(ml|g|gm|kg|l)\)\s*$/i, '');

/** `bp_` + the name without its pack size, deaccented, truncated at 47 — the
 *  shape every existing id has, recovered from them rather than chosen. */
export function idFor(name) {
  const slug = deaccent(stripPack(name)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `bp_${slug}`.slice(0, 47).replace(/_$/, '');
}

/**
 * Ingredients → actives, splitting on commas OUTSIDE parentheses.
 *
 * "Avène Thermal Spring Water (silicates, trace minerals)" is ONE active. A
 * plain `.split(',')` makes it two, the second of which is "trace minerals)",
 * and that string then goes to the allergy matcher and onto the product card.
 */
export function splitActives(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s ?? '') {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/**
 * The sheet's free-text skin/hair column → the types a face product suits.
 *
 * suitableSkin GATES HARD — a product whose list excludes you is never
 * recommended, at any score — so only FACE products are gated at all. A shampoo
 * listed as suiting oily skin would otherwise be withheld from everybody with
 * dry skin, which is a sentence about the wrong part of their body.
 */
export function suitableSkinFor(group, text) {
  if (group !== 'Skincare') return ['all'];
  const t = (text ?? '').toLowerCase();
  /**
   * SENSITIVE IS CHECKED FIRST, AND THAT ORDERING IS THE WHOLE FIX. The
   * "all skin types" short-circuit ran before anything else, so a sheet row
   * reading "All skin types, including sensitive" — and thirty-one of them do —
   * came out as ['all'] with the one word that mattered thrown away. Sensitive
   * skin then had to reach those products through `all`, which is exactly the
   * route that also handed it three retinoids.
   */
  const namesSensitive = /sensitiv/.test(t);
  if (/all skin types|all types/.test(t)) return namesSensitive ? ['all', 'sensitive'] : ['all'];
  const found = new Set();
  for (const type of SKIN_TYPES) if (new RegExp(`\\b${type}`).test(t)) found.add(type);
  // "dry to normal" is a range and means everything between its ends.
  if (/dry to normal/.test(t)) { found.add('dry'); found.add('normal'); }
  if (/normal to oily/.test(t)) { found.add('normal'); found.add('oily'); found.add('combination'); }
  if (/dry to very dry/.test(t)) found.add('dry');
  if (/acne.prone|blemish.prone/.test(t)) { found.add('oily'); found.add('combination'); }
  if (namesSensitive) found.add('sensitive');
  if (!found.size) return ['all'];
  // Three of the four base types is a list excluding one type by accident
  // rather than on purpose.
  const base = ['dry', 'oily', 'combination', 'normal'].filter((x) => found.has(x));
  if (base.length >= 3) return ['all'];
  return SKIN_TYPES.filter((x) => found.has(x));
}

export function deriveOne(row) {
  // A sheet may speak the old retailer vocabulary, which CATEGORY translates, or
  // the shelf's own, which needs no translation. An unrecognised category is
  // still a hard stop rather than a guess: the display category drives the
  // routine ROLE, the monthly dose and the application order.
  const category = CATEGORY[row.category] ?? (SELF_CATEGORIES.has(row.category) ? row.category : undefined);
  if (!category) throw new Error(`unmapped sheet category: "${row.category}" (${row.name})`);
  const group = row.group;
  const text = `${row.name} ${row.ingredients} ${row.benefits}`;

  // usage: the category, then vitamin C to the morning, then retinoids to the
  // night. THE RETINOID RULE RUNS LAST and that ordering is the whole of it — a
  // retinol serum whose copy mentions vitamin C was scheduled for the MORNING
  // when it ran first, and retinoids increase how easily you burn.
  let usage = USAGE[category] ?? 'Morning & Night';
  if (category === 'Serum' || category === 'Moisturiser') {
    if (VITAMIN_C.test(text)) usage = 'Morning';
  }
  /**
   * ── THE RETINOID RULE IS NO LONGER SCOPED TO TWO CATEGORIES ───────────────
   *
   * It used to read `if (category === 'Serum' || category === 'Moisturiser')`,
   * which was true of every retinoid the first three sheets contained. The
   * 2026-08 sheet contains Lotus Professional's Retemin PLANT RETINOL range as
   * an EYE CREAM and a FACIAL KIT, and both came out scheduled 'Morning &
   * Night' — a retinoid on the face at 9am, from a rule whose entire purpose is
   * to prevent exactly that.
   *
   * Photosensitivity is a property of the molecule, not of the packaging. The
   * rule now applies wherever a retinoid appears on a face or body product, and
   * it still runs LAST so that a retinoid whose copy also mentions vitamin C
   * cannot be flipped back to the morning.
   *
   * Hair products are excluded: 'Night' is not a band a shampoo can be in, and
   * `catalog-is-shoppable` checks the retinoid rule against name and actives,
   * which no hair product on this shelf trips.
   */
  if (RETINOID.test(text) && (group === 'Skincare' || group === 'Makeup')) usage = 'Night';
  else if (RETINOID.test(text) && group === 'Body Care') usage = 'Body';

  const site = siteFor(group, row.name);
  // A beard product keeps the Hair Care band and loses the scalp keys inside
  // it. What is left is `damage` — conditioning facial hair is a real claim and
  // the beard wash and softener rows already made only that one.
  const allowedKeys = (KEYS_FOR_GROUP[group] ?? []).filter((k) => !(site === 'beard' && SCALP_KEYS.has(k)));
  /**
   * THE SHEET'S OWN CONCERN COLUMN IS READ FIRST, WHERE IT HAS ONE.
   *
   * The 2026-08 sheet carries a `concern` field that was derived upstream from
   * the same ingredients and claims this function reads — so it agrees with the
   * keyword pass most of the time and is not new evidence. It earns its place on
   * the cases where the keyword pass finds NOTHING: a product whose copy is pure
   * brand poetry ("a ritual for the modern woman") would otherwise fall to the
   * category fallback and claim whatever its shelf neighbours claim. The concern
   * column at least came from that product's own ingredient list.
   *
   * It can only ever ADD a key the group already allows. It cannot let a
   * shampoo claim acne.
   */
  const CONCERN_KEYS = {
    'Acne & Breakouts': 'acne', 'Pigmentation & Tan': 'pigmentation',
    'Ageing & Wrinkles': 'wrinkles', 'Dryness & Dehydration': 'hydration',
    'Sensitivity & Redness': 'redness', 'Dullness & Shine': 'texture',
    'Sun Protection': 'pigmentation', 'Hair Fall & Thinning': 'density',
    'Dandruff & Scalp Health': 'scalp', 'Damage & Breakage': 'damage',
    'Frizz & Unmanageability': 'damage', 'Colour Protection': 'damage',
  };
  let profileKeys = allowedKeys.filter((k) => PROFILE_WORDS[k].test(text));
  if (!profileKeys.length && row.concern) {
    const fromConcern = String(row.concern).split(',')
      .map((c) => CONCERN_KEYS[c.trim()])
      .filter((k) => k && allowedKeys.includes(k));
    if (fromConcern.length) profileKeys = [...new Set(fromConcern)];
  }
  // A sunscreen always answers pigmentation. It is the single most effective
  // step against pigment deepening, every reviewed sunscreen on the shelf
  // carries the key, and a copy deck that forgets to say so is a copy deck.
  if (category === 'Sunscreen' && !profileKeys.includes('pigmentation')) profileKeys = [...profileKeys, 'pigmentation'];
  // The fallback is for TREATMENT products only. A perfume with no keys is
  // correct; a serum with no keys is a product nobody can ever be shown.
  if (!profileKeys.length && ROUTINE_GROUPS.has(group)) {
    profileKeys = KEY_FALLBACK[category] ?? [allowedKeys[0]].filter(Boolean);
  }

  // The same site rule as the keys, and for the same reason one layer quieter:
  // `hair-density` is what makes the engine print "Low ferritin (hair thinning
  // & increased shedding)" as the reason a product was prioritised. On a beard
  // oil that sentence is about the wrong hair.
  const allowedTags = (TAGS_FOR_GROUP[group] ?? []).filter((t) => !(site === 'beard' && SCALP_TAGS.has(t)));
  const tags = allowedTags.filter((t) => {
    if (t === 'spf' && category !== 'Sunscreen') return false;
    return TAG_WORDS[t].test(text);
  });

  const actives = splitActives(row.ingredients);
  return {
    // The 2026-08 sheet carries its own id, because 454 of its rows are shade
    // and size variants whose names collide once idFor() truncates at 47
    // characters. Disambiguating upstream keeps every one of them; letting
    // idFor() decide would silently drop a quarter of the shelf.
    id: row.id ?? idFor(row.name), name: row.name, brand: row.brand, category, group, site,
    priceInr: row.priceInr, tier: row.tier,
    tags, profileKeys,
    suitableSkin: suitableSkinFor(group, row.skinHair),
    actives, usage, blurb: row.benefits,
    keyIngredient: actives[0] ?? row.ingredients,
    ingredients: row.inci ? splitActives(row.inci) : actives,
    ingredientsSource: row.inci ? 'label' : 'sheet',
    image: row.image,
    // NOT `|| row.image`. The second photograph exists because a hotlinked URL
    // is the field most certain to rot, and a copy of the first is not a
    // fallback — it fails in the same instant, from the same CDN, for the same
    // reason. This sheet supplies one photo for 86 of its rows; those carry ''
    // and ProductShot walks straight to the category mark, which is a real
    // answer. Inventing a second URL would be worse than having none.
    imageAlt: row.imageAlt || '',
    productUrl: row.productUrl,
  };
}

// ── emit ───────────────────────────────────────────────────────────────────

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const arr = (xs) => `[${xs.map(q).join(', ')}]`;

function emit(p) {
  // `site` is emitted only where it differs from the group's default. See
  // src/beauty/product-site.ts — absence means the default, not "unknown".
  return `  { id: ${q(p.id)}, name: ${q(p.name)}, brand: ${q(p.brand)}, category: ${q(p.category)}, group: ${q(p.group)},${p.site ? ` site: ${q(p.site)},` : ''}\n`
    + `    priceInr: ${p.priceInr}, tier: ${q(p.tier)}, usage: ${q(p.usage)},\n`
    + `    tags: ${arr(p.tags)}, profileKeys: ${arr(p.profileKeys)}, suitableSkin: ${arr(p.suitableSkin)},\n`
    + `    actives: ${arr(p.actives)}, keyIngredient: ${q(p.keyIngredient)},\n`
    // The label's full INCI list when the sheet carries one (`inci`), else the
    // sheet's key ingredients — and the source says which, so the card can
    // never pass a short list off as the whole label.
    + `    ingredients: ${arr(p.ingredients)}, ingredientsSource: ${q(p.ingredientsSource)},\n`
    + `    blurb: ${q(p.blurb)},\n`
    + `    image: ${q(p.image)},\n`
    + `    imageAlt: ${q(p.imageAlt)},\n`
    + `    productUrl: ${q(p.productUrl)} },`;
}

// ── run ────────────────────────────────────────────────────────────────────

const sheet = JSON.parse(readFileSync(resolve(HERE, '..', opt('--sheet', 'scripts/beauty-sheet.json')), 'utf8'));
const src = readFileSync(CATALOG, 'utf8');
const existingIds = new Set([...src.matchAll(/id: '([^']+)'/g)].map((m) => m[1]));
const existingNames = new Set([...src.matchAll(/name: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const haveNames = new Set([...existingNames].map(norm));

const derived = sheet.map(deriveOne);
const fresh = [];
const seen = new Set(existingIds);
for (const p of derived) {
  if (haveNames.has(norm(p.name)) || seen.has(p.id)) continue;
  seen.add(p.id);
  fresh.push(p);
}

if (flag('--check')) {
  // Replay the derivation against rows that are already on the shelf and
  // already reviewed. Agreement here is the only evidence the rules travel.
  // Derived, not committed — it is the catalogue itself, one format along.
  // Regenerate with:
  //   npx tsx -e "import {BEAUTY_PRODUCTS} from './src/beauty/beauty-catalog';\
  //     console.log(JSON.stringify(BEAUTY_PRODUCTS))" > .catalog-snapshot.json
  let cur;
  try { cur = JSON.parse(readFileSync(SNAPSHOT, 'utf8')); }
  catch { console.error('--check needs .catalog-snapshot.json; see the comment above this line for the one-liner'); process.exit(2); }
  const byName = new Map(cur.map((p) => [norm(p.name), p]));
  const fields = ['category', 'usage', 'suitableSkin', 'profileKeys', 'tags', 'actives', 'keyIngredient', 'id'];
  const agree = Object.fromEntries(fields.map((f) => [f, 0]));
  let n = 0;
  const misses = [];
  const perKey = { profileKeys: { tp: 0, fp: 0, fn: 0 }, tags: { tp: 0, fp: 0, fn: 0 }, over: {}, under: {} };
  for (const row of sheet) {
    const old = byName.get(norm(row.name));
    if (!old) continue;
    n++;
    const got = deriveOne(row);
    for (const f of fields) {
      // SETS, NOT ARRAYS, for the list fields. profileKeys and tags are read
      // with .some() and .filter() everywhere in the engine; their order has
      // never meant anything, and scoring an order difference as a miss hides
      // the ones that are real.
      const norm_ = (v) => (Array.isArray(v) && f !== 'actives' ? JSON.stringify([...v].sort()) : JSON.stringify(v));
      const a = norm_(got[f]); const b = norm_(old[f]);
      if (a === b) agree[f]++;
      else if (misses.length < 400) misses.push([f, old.name, b, a]);
    }
    for (const f of ['profileKeys', 'tags']) {
      const g = new Set(got[f]); const o = new Set(old[f]);
      perKey[f].tp += [...g].filter((x) => o.has(x)).length;
      perKey[f].fp += [...g].filter((x) => !o.has(x)).length;
      perKey[f].fn += [...o].filter((x) => !g.has(x)).length;
      for (const x of g) if (!o.has(x)) (perKey.over[x] = (perKey.over[x] ?? 0) + 1);
      for (const x of o) if (!g.has(x)) (perKey.under[x] = (perKey.under[x] ?? 0) + 1);
    }
  }
  console.log(`replayed against ${n} already-reviewed rows`);
  for (const f of fields) console.log(`  ${f.padEnd(14)} ${agree[f]}/${n}  ${Math.round(100 * agree[f] / n)}%`);
  for (const f of ['profileKeys', 'tags']) {
    const { tp, fp, fn } = perKey[f];
    console.log(`  ${f} precision ${Math.round(100 * tp / (tp + fp))}%  recall ${Math.round(100 * tp / (tp + fn))}%`);
  }
  console.log('  claimed and should not be:', JSON.stringify(perKey.over));
  console.log('  missed and should be:     ', JSON.stringify(perKey.under));
  if (flag('--verbose')) for (const [f, name, b, a] of misses) console.log(`  ${f} | ${name.slice(0, 46)}\n     was ${b}\n     now ${a}`);
}

console.log(`sheet ${sheet.length} rows · already on the shelf ${sheet.length - fresh.length} · new ${fresh.length}`);

let repriced = [];
try {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const priceByName = new Map(snapshot.map((p) => [norm(p.name), p.priceInr]));
  repriced = sheet.filter((row) => priceByName.has(norm(row.name)) && priceByName.get(norm(row.name)) !== row.priceInr);
} catch { /* no snapshot, no price comparison — the append does not depend on it */ }
if (repriced.length) {
  console.log(`\n! ${repriced.length} product(s) carry a different price on the sheet than on the shelf.`);
  console.log('  Reported, not applied — a price move is a real diff and belongs in its own commit.');
  for (const r of repriced.slice(0, 10)) console.log(`    ${r.name}  shelf ₹${priceByName.get(norm(r.name))} → sheet ₹${r.priceInr}`);
}

if (flag('--replace')) {
  /**
   * ── REPLACE, WHICH THIS SCRIPT SPENT ITS WHOLE LIFE REFUSING TO DO ────────
   *
   * Everything above the fold in this file argues for appending, and that
   * argument was right for the three sheets it was written against: each was a
   * partial view of the same retail catalogue, none was a superset, and
   * treating any of them as the shelf would have silently deleted products the
   * specs pin by name.
   *
   * The 2026-08 sheet is a different object. It is not another export of the
   * same retailer — it is twenty-nine brands' own catalogues, and the owner
   * asked for it to BE the shelf. So this mode exists, and what it costs is
   * stated rather than absorbed:
   *
   *   · The 226 products already on the shelf are DELETED, including every
   *     hand-reviewed derived field on them. Three rounds of review are thrown
   *     away. That is the price of the instruction and it is not recoverable
   *     from here — it is recoverable from git.
   *   · The mass-market rows go with them. Minimalist, CeraVe, Cetaphil, The
   *     Ordinary, Plum, Biotique, Clinic Plus. Those are what produced the
   *     ₹215 cheapest-complete-routine floor, and the new shelf is salon and
   *     premium weighted, so that floor MOVES. BELOW_THE_FLOOR is a test with
   *     a number in it, and the number is now wrong in the honest direction.
   *   · Every derived field on all 1,841 rows is machine-derived and unreviewed.
   *     `--check` cannot help here: it replays against rows that no longer
   *     exist. catalog-is-shoppable.spec.ts is the only guard left standing,
   *     which is why it checks the WHOLE catalogue and names offenders by id.
   *
   * Append remains the default. You have to ask for this one.
   */
  const all = sheet.map(deriveOne);
  const ids = new Map();
  for (const p of all) ids.set(p.id, (ids.get(p.id) ?? 0) + 1);
  const collisions = [...ids].filter(([, n]) => n > 1);
  if (collisions.length) {
    console.error(`REFUSING: ${collisions.length} duplicate id(s) in the sheet, e.g. ${collisions.slice(0, 5).map(([i]) => i).join(', ')}`);
    console.error('Two products sharing an id means buying the wrong thing, silently.');
    process.exit(1);
  }

  const head = src.slice(0, src.indexOf('export const BEAUTY_PRODUCTS'));
  const byGroup = new Map();
  for (const p of all) {
    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
    byGroup.get(p.group).push(p);
  }
  const ORDER_OF_GROUPS = ['Skincare', 'Hair Care', 'Body Care', 'Makeup', 'Fragrance', 'Tools'];
  let body = '';
  for (const g of ORDER_OF_GROUPS) {
    const rows = byGroup.get(g);
    if (!rows?.length) continue;
    rows.sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    const rule = '─'.repeat(Math.max(4, 66 - g.length));
    body += `\n  // ── ${g} ${rule}\n` + rows.map(emit).join('\n') + '\n';
  }
  const out = head + 'export const BEAUTY_PRODUCTS: BeautyProduct[] = [' + body + '];\n';
  if (flag('--write')) {
    writeFileSync(CATALOG, out);
    console.log(`\nREPLACED the shelf: ${all.length} products, ${new Set(all.map((p) => p.brand)).size} brands`);
    for (const g of ORDER_OF_GROUPS) if (byGroup.get(g)) console.log(`  ${g.padEnd(11)} ${byGroup.get(g).length}`);
    const noKeys = all.filter((p) => !p.profileKeys.length);
    console.log(`  browsed-not-matched (no profileKeys, by design): ${noKeys.length}`);
  } else {
    console.log(`\n(dry run — --replace --write would write ${all.length} products over the existing shelf)`);
  }
  process.exit(0);
}

if (flag('--write')) {
  const marker = '\n];\n';
  const at = src.lastIndexOf(marker);
  if (at < 0) throw new Error('could not find the end of BEAUTY_PRODUCTS');
  const block = `\n\n  // ── appended ${opt('--label', 'from the data sheet')} ─────────────────────────────\n`
    + fresh.map(emit).join('\n') + '\n';
  writeFileSync(CATALOG, src.slice(0, at) + block + src.slice(at + 1));
  console.log(`\nwrote ${fresh.length} products into src/beauty/beauty-catalog.ts`);
} else {
  console.log('\n(dry run — pass --write to append)');
}
