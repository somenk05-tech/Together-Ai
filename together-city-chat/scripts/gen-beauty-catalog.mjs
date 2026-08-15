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

/** When it is used, by category — then two overrides, and the ORDER MATTERS. */
const USAGE = {
  Cleanser: 'Morning & Night', Toner: 'Morning & Night', Serum: 'Morning & Night',
  Moisturiser: 'Morning & Night', Sunscreen: 'Morning', 'Face mask': 'Weekly',
  Shampoo: 'Weekly', Conditioner: 'Weekly', 'Hair mask': 'Weekly', 'Hair oil': 'Weekly',
  'Hair serum': 'Night',
  'Body wash': 'Body', 'Body lotion': 'Body', 'Body scrub': 'Body',
  'Hand cream': 'Body', 'Lip balm': 'Body',
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

/** Which keys a group may claim. A face cream cannot have an opinion about a scalp. */
const KEYS_FOR_GROUP = {
  Skincare: ['acne', 'oil', 'texture', 'hydration', 'pigmentation', 'wrinkles', 'redness'],
  'Hair Care': ['scalp', 'density', 'damage', 'thickness'],
  'Body Care': ['hydration', 'texture', 'redness'],
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
};

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
  const category = CATEGORY[row.category];
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
    if (RETINOID.test(text)) usage = 'Night';
  }

  const allowedKeys = KEYS_FOR_GROUP[group] ?? [];
  let profileKeys = allowedKeys.filter((k) => PROFILE_WORDS[k].test(text));
  // A sunscreen always answers pigmentation. It is the single most effective
  // step against pigment deepening, every reviewed sunscreen on the shelf
  // carries the key, and a copy deck that forgets to say so is a copy deck.
  if (category === 'Sunscreen' && !profileKeys.includes('pigmentation')) profileKeys = [...profileKeys, 'pigmentation'];
  if (!profileKeys.length) profileKeys = KEY_FALLBACK[category] ?? [allowedKeys[0]].filter(Boolean);

  const allowedTags = TAGS_FOR_GROUP[group] ?? [];
  const tags = allowedTags.filter((t) => {
    if (t === 'spf' && category !== 'Sunscreen') return false;
    return TAG_WORDS[t].test(text);
  });

  const actives = splitActives(row.ingredients);
  return {
    id: idFor(row.name), name: row.name, brand: row.brand, category, group,
    priceInr: row.priceInr, tier: row.tier,
    tags, profileKeys,
    suitableSkin: suitableSkinFor(group, row.skinHair),
    actives, usage, blurb: row.benefits,
    keyIngredient: actives[0] ?? row.ingredients,
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
  return `  { id: ${q(p.id)}, name: ${q(p.name)}, brand: ${q(p.brand)}, category: ${q(p.category)}, group: ${q(p.group)},\n`
    + `    priceInr: ${p.priceInr}, tier: ${q(p.tier)}, usage: ${q(p.usage)},\n`
    + `    tags: ${arr(p.tags)}, profileKeys: ${arr(p.profileKeys)}, suitableSkin: ${arr(p.suitableSkin)},\n`
    + `    actives: ${arr(p.actives)}, keyIngredient: ${q(p.keyIngredient)},\n`
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
