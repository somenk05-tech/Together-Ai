import type { BeautyProduct } from './beauty-engine';

/**
 * What a product actually costs you per month.
 *
 * WHY THIS EXISTS. A budget of ₹5,000 a month compared against a shelf of
 * purchase prices is not a comparison at all. A ₹3,200 cleanser that lasts four
 * months and a ₹800 serum that lasts three weeks look like a ₹4,000 problem and
 * are nothing of the sort. Every budget decision in this hub — what fits, what
 * to upgrade, what to leave out — is made against the number in here, and
 * against purchase price nowhere.
 *
 * THE ESTIMATE HAS THREE PARTS, and all three are stated rather than hidden in
 * a constant: how big the pack is, how much of it a person uses in a month, and
 * how long you can reasonably keep it once opened.
 *
 *   SIZE comes out of the product's own name — "(100 ml)", "(50 g)" — which is
 *   where the data sheet puts it. Every one of the seventy has one. A product
 *   that ever arrives without a size is not guessed at: it falls back to the
 *   category's typical pack, and the guess is visible in the code rather than
 *   in a mysterious number.
 *
 *   USE PER MONTH is the judgement, and it is deliberately generous rather than
 *   flattering. The honest sunscreen dose is two finger-lengths a day, so this
 *   says 36 ml a month and a 50 ml tube lasts six weeks — which is the truth
 *   people find surprising. Estimating usage at what somebody SHOULD apply
 *   rather than what makes the budget look comfortable is the whole point: a
 *   routine costed on under-application is a routine that does not work.
 *
 *   PERIOD AFTER OPENING caps it at twelve months. A 500 ml micellar water used
 *   on the face would otherwise read as lasting two and a half years and cost
 *   ₹40 a month. Most of these carry a 6M or 12M symbol; a year is the
 *   generous end of that and stops the arithmetic from recommending a product
 *   nobody will still be using when it runs out.
 *
 * ALL OF IT IS AN ESTIMATE AND THE UI SAYS SO — "≈ ₹366/month", never "₹366".
 */

/** ml (or g) a person gets through in a month, by display category. */
const USE_PER_MONTH: Record<string, number> = {
  // Face. A pump of foaming cleanser is about a millilitre, twice a day.
  Cleanser: 60,
  Toner: 90,
  Serum: 10.5,          // 2–3 drops ≈ 0.35 ml, once a day; doubled below if used twice
  Moisturiser: 24,      // ≈ 0.4 ml morning and night
  Sunscreen: 36,        // two finger-lengths, every day — the honest dose
  'Face mask': 28,      // ≈ 7 ml, once a week

  // Hair. Twelve washes a month is roughly every other day.
  Shampoo: 120,
  Conditioner: 120,
  'Hair mask': 60,
  'Hair oil': 60,
  'Hair serum': 20,

  // Body.
  'Body wash': 200,
  'Body lotion': 200,
  'Body scrub': 100,
  'Hand cream': 20,   // a 30 g tube is about six weeks, not three
  'Lip balm': 2.5,
};

/** Where a pack size is missing, the typical pack for that category. */
const TYPICAL_PACK: Record<string, number> = {
  Cleanser: 100, Toner: 200, Serum: 30, Moisturiser: 50, Sunscreen: 50, 'Face mask': 100,
  Shampoo: 250, Conditioner: 200, 'Hair mask': 200, 'Hair oil': 200, 'Hair serum': 100,
  'Body wash': 250, 'Body lotion': 400, 'Body scrub': 200, 'Hand cream': 75, 'Lip balm': 10,
};

/** Nothing lasts more than a year once it is open, whatever the arithmetic says. */
const MAX_MONTHS = 12;
/** And nothing is costed as lasting less than a fortnight. */
const MIN_MONTHS = 0.5;

/** "(100 ml)" · "(50 g)" · "(1.5 kg)" → millilitres or grams, treated alike. */
export function packSize(name: string): number | null {
  const m = /\(([\d.]+)\s*(ml|g|gm|kg|l)\)/i.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  return unit === 'kg' || unit === 'l' ? n * 1000 : n;
}

/** How many months one pack lasts this person, at the honest dose. */
export function monthsOfUse(p: Pick<BeautyProduct, 'name' | 'category' | 'usage'>): number {
  const size = packSize(p.name) ?? TYPICAL_PACK[p.category] ?? 100;
  let per = USE_PER_MONTH[p.category] ?? 50;
  // A serum used morning AND night is two applications, not one. Only the
  // serum is scaled: a cleanser's number already assumes twice a day, and a
  // sunscreen at night is not a thing.
  if (p.category === 'Serum' && /morning\s*&\s*night/i.test(p.usage)) per *= 2;
  const months = size / per;
  return Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, months));
}

/**
 * What it costs per month, rounded up to a rupee.
 *
 * UP, not to nearest: a routine that comes in at exactly the budget because
 * eight roundings went down is a routine that is over budget in real life.
 */
export function monthlyCostInr(p: Pick<BeautyProduct, 'name' | 'category' | 'usage' | 'priceInr'>): number {
  return Math.max(1, Math.ceil(p.priceInr / monthsOfUse(p)));
}

/** "≈ ₹366/month" — the phrase, in one place, so it reads the same everywhere. */
export function monthlyLabel(inr: number): string {
  return `≈ ₹${inr.toLocaleString('en-IN')}/month`;
}

/** "100 ml" · "50 g" — what is written on the pack, as the sheet wrote it. */
export function packLabel(name: string): string {
  const m = /\(([\d.]+\s*(?:ml|g|gm|kg|l))\)/i.exec(name);
  return m ? m[1].replace(/\s+/g, ' ').toLowerCase() : '';
}

/**
 * "about 6 weeks" · "about 3 months".
 *
 * WEEKS UNDER TWO MONTHS, because "1.4 months" is not a thing anybody says and
 * rounding it to "1 month" is the difference between buying one sunscreen a
 * month and running out halfway through. Above that, months to the nearest
 * half, because at three months nobody cares about a fortnight.
 *
 * This is the number that makes the monthly cost believable. "₹1,099 ≈
 * ₹366/month" invites the question "says who?"; "one 88 ml bottle, about three
 * months" answers it before it is asked.
 */
export function lastsLabel(months: number): string {
  if (months < 2) {
    const weeks = Math.max(1, Math.round(months * 4.345));
    return `about ${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  const halves = Math.round(months * 2) / 2;
  const shown = Number.isInteger(halves) ? String(halves) : `${Math.floor(halves)}½`;
  return `about ${shown} months`;
}
