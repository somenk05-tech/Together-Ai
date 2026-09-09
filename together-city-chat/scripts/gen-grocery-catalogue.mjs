#!/usr/bin/env node
/**
 * ── THE CITY'S GROCERY CATALOGUE, BUILT FROM PUBLIC DATABASES ───────────────
 *
 * Owner, 8 Sep: "create an online grocery store using the internet, show all
 * the products that's available in an area."
 *
 *     node scripts/gen-grocery-catalogue.mjs            # rebuild the JSON
 *     node scripts/gen-grocery-catalogue.mjs --refresh  # re-fetch the sources first
 *
 * RUN THIS, DO NOT EDIT THE OUTPUT — the same rule `gen-gem-catalog.mjs` and
 * `gen-beauty-catalog.mjs` keep, for the same reason: the next version of the
 * data arrives as a file, and diffing somebody's hand-edits against it is how a
 * catalogue quietly stops matching the source it claims to come from.
 *
 * TWO STEPS, AND THE FIRST ONE IS THE ONE THAT NEEDS THE INTERNET.
 *
 *   1. `--refresh` fetches the three public databases and writes flat extracts
 *      to prisma/data/sources/. Those extracts are COMMITTED: they are the
 *      provenance, and rebuilding the catalogue on a machine with no network
 *      must give exactly the same file as rebuilding it on one that has.
 *   2. The default pass reads those extracts and writes
 *      prisma/data/grocery-catalogue.json, which prisma/seed-grocery-catalogue.ts
 *      upserts into GroceryProduct.
 *
 * ── WHAT IS NOT IN HERE, AND WHY ────────────────────────────────────────────
 *
 * NO PRICES. Not one, from any source, ever. On 2 August this hub compared a
 * grocery list across Blinkit, Zepto, Instamart, BigBasket and JioMart with
 * numbers that came out of a simulation in `quick-commerce.ts`, under those
 * retailers' real names; `grocery-orders-removed.spec.ts` is the standing
 * apology and this line is the lesson. A price is a claim somebody has to be
 * able to stand behind, and only the shopkeeper who will sell you the thing can
 * stand behind one. Agmarknet publishes daily mandi rates and we take none of
 * them: a wholesale quintal rate at Vashi is not what a shop charges for half a
 * kilo, and putting one on a tile would be the same mistake in a sarkari font.
 *
 * NO RETAILER IS A SOURCE. All three databases below are open data — two are
 * community barcode databases, one is the Government of India's own commodity
 * master. None of them sells anything, which is exactly why they can be read.
 *
 * ── THE THREE SOURCES ───────────────────────────────────────────────────────
 *
 *   Open Food Facts (ODbL)     packaged food and drink, by barcode
 *   Open Beauty Facts (ODbL)   soap, shampoo, toothpaste, by barcode
 *   Agmarknet (GODL-India)     loose goods: the commodity master every mandi's
 *                              arrivals are filed under. No barcode exists for
 *                              an onion, and a grocery catalogue with no
 *                              vegetables in it is not a grocery catalogue.
 *
 * Both barcode databases are queried with `countries_tags_en=india`, so a pack
 * only enters the catalogue if somebody has recorded it as sold in India.
 *
 * ── THE QUALITY RULES, AND WHY EACH ONE DROPS ROWS ──────────────────────────
 *
 * Open data is contributed data, and the extracts contain rows typed by people
 * testing the app ("dfgdf"), rows where the brand field holds a sentence
 * ("Clinic Plus is sold by Hindustan Unilever"), and rows whose quantity is
 * "75" with no unit. A shopkeeper picking from a list cannot be expected to
 * catch those, so they are dropped here rather than shown:
 *
 *   · no photograph            → dropped. A picker of grey rectangles is a form,
 *                                and the Beauty shelf already settled this: the
 *                                owner hid 902 rows without a picture rather
 *                                than show placeholders.
 *   · brand or name under 2 chars, or brand over 40 → dropped (a sentence).
 *   · brand says "is sold by"  → dropped. That is a note, not a brand.
 *   · name equals brand        → dropped. The row says nothing.
 *   · quantity with no unit    → dropped. "75" is not a pack.
 *   · obvious keyboard junk    → dropped.
 *
 * The ONE change made to surviving data is spacing: "200ml" becomes "200 ml".
 * Not a conversion, not a rounding, not a guess — the same characters.
 *
 * ── THE AISLE IS THE SOURCE'S FILING, NEVER OUR READING ─────────────────────
 *
 * `local-services/grocery.ts` files a shopkeeper's row by the heading the
 * shopkeeper typed and never by reading the product's name. The same rule holds
 * one step back: a catalogue row's aisle comes from the category the SOURCE
 * database put it in — Open Food Facts' category tag, Agmarknet's commodity
 * group. Reading "Surf Excel" and deciding it is detergent would be this script
 * inventing a fact about a product.
 *
 * ── ONE DELIBERATE EXCLUSION ────────────────────────────────────────────────
 *
 * Agmarknet's "Live Stock,Poultry,Fisheries" group is mostly live animals — Ox,
 * Calf, Ram, She Buffalo, Silk Cocoon. Six of its rows are things sold over a
 * shop counter (Egg, Fish, Dry Fish, Prawn, Shrimp, Crab) and only those six
 * are extracted. Cuts of meat are not invented here: a butcher's own rows say
 * what a butcher sells, and `grocery.ts` already files them under Meat & Fish
 * by the trade they registered under.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'prisma', 'data', 'sources');
const OUT = join(ROOT, 'prisma', 'data', 'grocery-catalogue.json');

/* ── the shape of an extract line ─────────────────────────────────────────────
   barcode databases: code|imageRev|imageLang|aisle|brand|name|pack
   agmarknet:         commodityGroup|commodityId|name                          */

/** Open Food Facts stores an image under the barcode padded to 13 and split
 *  3/3/3/rest. Verified against every extracted row rather than assumed. */
const imagePath = (code) => {
  const p = String(code).padStart(13, '0');
  return `${p.slice(0, 3)}/${p.slice(3, 6)}/${p.slice(6, 9)}/${p.slice(9)}`;
};

const IMAGE_HOST = {
  openfoodfacts: 'https://images.openfoodfacts.org',
  openbeautyfacts: 'https://images.openbeautyfacts.org',
};

/** Agmarknet commodity group → the city's aisle. A translation between two
 *  filing systems, which is a fact about the systems and not about any row. */
const GROUP_AISLE = {
  'Vegetables': 'produce',
  'Fruits': 'produce',
  'Cereals': 'staples',
  'Pulses': 'staples',
  'Spices': 'staples',
  'Dry Fruits': 'staples',
  'Oils and Fats': 'staples',
  'Live Stock,Poultry,Fisheries': 'meat',
};

const lines = (file) =>
  readFileSync(join(SOURCES, file), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const searchTextFor = (brand, name, pack) =>
  [brand ?? '', name, pack ?? ''].join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

function packed(file, sourceKey) {
  return lines(file).map((l) => {
    const [code, rev, lang, aisle, brand, name, pack] = l.split('|');
    return {
      aisle,
      brand,
      name,
      pack,
      gtin: code,
      imageUrl: `${IMAGE_HOST[sourceKey]}/images/products/${imagePath(code)}/front_${lang}.${rev}.200.jpg`,
      loose: false,
      sourceKey,
      sourceRef: code,
      searchText: searchTextFor(brand, name, pack),
    };
  });
}

function loose() {
  return lines('agmarknet.txt').map((l) => {
    const [group, id, name] = l.split('|');
    return {
      aisle: GROUP_AISLE[group] ?? 'other',
      /* NO BRAND AND NO PACK. An onion has no manufacturer, and how much of it
         you get is the shop's scale and the shop's decision — which is why the
         picker asks a shop for a price per kilo on these and a price per pack
         on the others. */
      brand: null,
      name,
      pack: null,
      gtin: null,
      /* AND NO PHOTOGRAPH. Agmarknet publishes none, and a stock photo of
         somebody else's tomatoes standing in for these is the kind of small
         lie this catalogue exists to avoid. The shop's own photo fills it in. */
      imageUrl: null,
      loose: true,
      sourceKey: 'agmarknet',
      sourceRef: id,
      searchText: searchTextFor(null, name, null),
    };
  });
}

function build() {
  const rows = [
    ...packed('openfoodfacts.txt', 'openfoodfacts'),
    ...packed('openbeautyfacts.txt', 'openbeautyfacts'),
    ...loose(),
  ];

  /* A barcode is one product. Two rows carrying one is one product entered
     twice, and it would split a shelf tile in half. */
  const seenGtin = new Set();
  const seenRef = new Set();
  const out = [];
  for (const r of rows) {
    const refKey = `${r.sourceKey}:${r.sourceRef}`;
    if (seenRef.has(refKey)) continue;
    if (r.gtin && seenGtin.has(r.gtin)) continue;
    seenRef.add(refKey);
    if (r.gtin) seenGtin.add(r.gtin);
    out.push(r);
  }
  out.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');

  const byAisle = {};
  for (const r of out) byAisle[r.aisle] = (byAisle[r.aisle] ?? 0) + 1;
  console.log(`wrote ${out.length} products to prisma/data/grocery-catalogue.json`);
  console.log(byAisle);
}

/* ── --refresh: RE-READ THE THREE DATABASES INTO THE EXTRACTS ────────────────
 *
 * Everything below only rewrites prisma/data/sources/. It is the only part
 * that touches the network, and it is separate from `build()` on purpose: a
 * checkout with no network must still be able to rebuild the catalogue and get
 * byte-for-byte the same file. The queries and the quality rules here are the
 * ones the committed extracts were produced with — change them and you are
 * changing what the catalogue is, so change the header comment with them.
 */

/** The category queries, and the aisle each one's rows are filed under. The
 *  aisle is the SOURCE's filing: it is which query found the row, i.e. which
 *  category that database put it in, and never a reading of the name. */
const FOOD_JOBS = [
  ['rice', 'staples'], ['flours', 'staples'], ['legumes', 'staples'], ['vegetable-oils', 'staples'],
  ['spices', 'staples'], ['sugars', 'staples'], ['salts', 'staples'], ['honeys', 'staples'],
  ['pastas', 'staples'], ['dried-fruits', 'staples'],
  ['dairies', 'dairy'], ['yogurts', 'dairy'], ['cheeses', 'dairy'], ['butters', 'dairy'],
  ['milks', 'dairy'], ['eggs', 'dairy'],
  ['breads', 'bakery'],
  ['biscuits', 'packaged'], ['snacks', 'packaged'], ['chocolates', 'packaged'],
  ['breakfast-cereals', 'packaged'], ['noodles', 'packaged'], ['sauces', 'packaged'],
  ['jams', 'packaged'], ['confectioneries', 'packaged'], ['canned-foods', 'packaged'],
  ['teas', 'beverages'], ['coffees', 'beverages'], ['fruit-juices', 'beverages'],
  ['sodas', 'beverages'], ['waters', 'beverages'],
];

const BEAUTY_JOBS = [
  ['shampoos', 'personal'], ['soaps', 'personal'], ['toothpastes', 'personal'],
  ['deodorants', 'personal'], ['hair-care', 'personal'], ['skin-care', 'personal'],
  ['body-care', 'personal'], ['oral-hygiene', 'personal'], ['shaving', 'personal'],
  ['hand-soaps', 'personal'], ['baby-care', 'personal'], ['face-care', 'personal'],
];

/* The quality rules the header explains. Kept as constants so the rule and the
   sentence describing it sit next to each other. */
const UNIT = /(^|[\s(])(\d+(?:[.,]\d+)?)\s*(g|gm|gms|gram|grams|kg|kgs|ml|mls|l|ltr|litre|liter|cl|pcs|pc|n|no|nos|pack|packs|sachet|sachets|piece|pieces|tablets|capsules)\b/i;
const JUNK = /^(.)\1{2,}$|^[a-z]{1,3}$|^test|^abc|dfgd|asdf|qwer/i;
const NOT_A_BRAND = /\bis sold by\b|^\d+$/i;

/** Open Food Facts asks for one search a second at most; 6.5s is polite and
 *  makes a full refresh about five minutes, which is the right trade for a
 *  file that changes a few times a year. */
const PAUSE_MS = 6500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(host, cat, tries = 4) {
  const q = new URLSearchParams({
    countries_tags_en: 'india',
    categories_tags_en: cat,
    fields: 'code,product_name,brands,quantity,image_front_small_url',
    sort_by: 'popularity_key',
    page_size: '100',
  });
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${host}/api/v2/search?${q}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'TogetherCity/1.0 (connect@togetherai.tech)' },
      });
      return await res.json();
    } catch {
      await sleep(4000 + i * 3000);
    }
  }
  return null;
}

/** A row survives, cleaned, or it does not survive. Nothing is repaired by
 *  guessing: the only edit is spacing inside the pack. */
function keep(p, aisle, sourceKey) {
  const brand = (p.brands ?? '').split(',')[0].trim();
  const name = (p.product_name ?? '').trim();
  const qty = (p.quantity ?? '').trim();
  const img = p.image_front_small_url ?? '';
  if (!p.code || !img || brand.length < 2 || name.length < 2 || brand.length > 40) return null;
  if (NOT_A_BRAND.test(brand) || JUNK.test(name) || JUNK.test(brand)) return null;
  if (name.toLowerCase() === brand.toLowerCase()) return null;
  if (!UNIT.test(qty) || name.length > 90 || qty.length > 30) return null;
  const m = img.match(/\/images\/products\/(.+)\/front_([a-z]{2})\.(\d+)\.200\.jpg$/);
  /* The image URL must be the one imagePath() would build. If it is not, this
     row's picture cannot be reconstructed from its barcode and the extract
     would be storing a URL it cannot verify — so it goes. */
  if (!m || m[1] !== imagePath(p.code)) return null;
  const pack = qty.replace(/(\d)\s*([a-zA-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  void sourceKey;
  return [p.code, m[3], m[2], aisle, brand, name, pack].join('|');
}

async function refreshBarcodes(host, jobs, file, sourceKey) {
  const seen = new Map();
  for (const [cat, aisle] of jobs) {
    const r = await search(host, cat);
    let kept = 0;
    for (const p of r?.products ?? []) {
      if (seen.has(p.code)) continue;
      const line = keep(p, aisle, sourceKey);
      if (!line) continue;
      seen.set(p.code, line);
      kept++;
    }
    console.log(`  ${cat}: ${r?.count ?? 'ERR'} found, +${kept} kept`);
    await sleep(PAUSE_MS);
  }
  writeFileSync(join(SOURCES, file), [...seen.values()].join('\n') + '\n', 'utf8');
  console.log(`  → ${file}: ${seen.size} rows`);
}

/** Agmarknet's commodity master, whole, filtered to the groups a grocery sells
 *  plus the six counter-sold rows of the livestock group (see the header). */
const COUNTER_SOLD = new Set(['Egg', 'Fish', 'Dry Fish', 'Prawn', 'Shrimp', 'Crab']);

async function refreshCommodities() {
  const r = await fetch('https://api.agmarknet.gov.in/v1/commodities?items_per_page=700').then((x) => x.json());
  const out = [];
  for (const c of r.data ?? []) {
    const group = c.cmdt_group;
    if (!(group in GROUP_AISLE)) continue;
    if (group === 'Live Stock,Poultry,Fisheries' && !COUNTER_SOLD.has(c.cmdt_name)) continue;
    out.push([group, c.id, String(c.cmdt_name).trim()].join('|'));
  }
  writeFileSync(join(SOURCES, 'agmarknet.txt'), out.join('\n') + '\n', 'utf8');
  console.log(`  → agmarknet.txt: ${out.length} rows`);
}

async function refresh() {
  mkdirSync(SOURCES, { recursive: true });
  console.log('Open Food Facts…');
  await refreshBarcodes('https://world.openfoodfacts.org', FOOD_JOBS, 'openfoodfacts.txt', 'openfoodfacts');
  console.log('Open Beauty Facts…');
  await refreshBarcodes('https://world.openbeautyfacts.org', BEAUTY_JOBS, 'openbeautyfacts.txt', 'openbeautyfacts');
  console.log('Agmarknet…');
  await refreshCommodities();
}

if (process.argv.includes('--refresh')) {
  await refresh();
}

if (!existsSync(SOURCES)) {
  console.error('No extracts in prisma/data/sources — run with --refresh on a machine with network.');
  process.exit(1);
}
build();
