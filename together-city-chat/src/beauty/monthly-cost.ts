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

/**
 * ml (or g) a person gets through in a month, by display category.
 *
 * ── EVERY FIGURE HERE IS ANCHORED TO THE SUNSCREEN ONE ──────────────────────
 *
 * 36 ml a month is two finger-lengths a day over a face and neck — about
 * 1.2 ml an application, the dose sunscreen is actually tested at. It was
 * right when it was written and it is the only number in this table that was
 * derived from anything, so everything else is now stated as a fraction of it
 * rather than guessed at separately.
 *
 * WHAT THAT CORRECTED, AND WHY IT MATTERED MORE THAN IT LOOKS. A moisturiser
 * was costed at 24 ml a month — 0.4 ml morning and night, which is a pea for
 * a whole face, and under-application rather than use. A 190 ml Biotique jar
 * therefore "lasted" eight months and reported ₹47 a month, which is not a
 * price anybody recognises. And because the planner ranks on monthly cost,
 * every large cheap pack was being scored as almost free: routines came out at
 * ₹1,275 against a ₹5,000 budget and the shortfall looked like the engine
 * refusing to spend when a quarter of it was arithmetic.
 *
 * A ROUTINE COSTED ON UNDER-APPLICATION IS A ROUTINE THAT DOES NOT WORK, and
 * it is also a shelf whose cheap end is fictionally cheap. Both halves of that
 * are corrected together.
 *
 * WHAT IS DELIBERATELY LEFT ALONE. The toner figure is bimodal and no honest
 * single number exists for it: a hydrating toner is swept on twice a day and a
 * 2% BHA exfoliant is used on a pad three times a week, and this table cannot
 * tell them apart because the catalogue does not carry a frequency. 90 ml sits
 * between the two and is wrong in both directions. The fix is a per-product
 * dose on the data sheet, not a cleverer average here.
 */
const USE_PER_MONTH: Record<string, number> = {
  // Face, against the 1.2 ml sunscreen application.
  Cleanser: 90,         // ≈ 1.5 ml a wash, twice a day
  Toner: 90,            // see the note above — the one number here still guessed
  Serum: 15,            // 4 drops ≈ 0.5 ml once a day; doubled below if used twice
  Moisturiser: 45,      // ≈ 0.75 ml over face and neck, morning and night
  Sunscreen: 36,        // two finger-lengths, every day — the anchor
  'Face mask': 28,      // ≈ 7 ml, once a week

  // Hair. Twelve washes a month is roughly every other day.
  Shampoo: 120,
  Conditioner: 120,
  'Hair mask': 80,      // ≈ 20 ml, on wash day
  'Hair oil': 60,
  'Hair serum': 20,

  // Body — a whole body is a far bigger surface than a face, and these two
  // were carrying face-sized numbers.
  'Body wash': 300,     // ≈ 10 ml a shower
  'Body lotion': 360,   // ≈ 12 ml over a whole body, daily
  'Body scrub': 100,
  'Hand cream': 20,     // a 30 g tube is about six weeks, not three
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

/**
 * How many days a "month" is, for turning a pack's life into a calendar date.
 *
 * IT IS DERIVED FROM `lastsLabel`'S OWN 4.345 WEEKS rather than picked afresh,
 * and that is the whole reason it lives here. The reorder countdown says "45
 * days" about the same bottle this file calls "about 6 weeks"; two independent
 * constants would eventually disagree by a day and produce a page that says six
 * weeks in one place and forty-one days in another. One number, one file, and
 * the label and the date cannot drift apart.
 */
export const DAYS_PER_MONTH = 4.345 * 7;

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
  // AT THE CEILING THE NUMBER IS A FLOOR, AND SAYING "12 MONTHS" HIDES THAT.
  // `monthsOfUse` clamps at a year because nothing survives longer once opened,
  // so a 1000 ml conditioner and a 360 ml hand cream both come out at exactly
  // 12 and both print a rupee figure that is the cheapest the model is allowed
  // to say. Two of the fourteen steps on the live sheet are sitting on this
  // clamp. An estimate that is really a bound should read as one.
  if (months >= MAX_MONTHS) return 'a year or more';
  if (months < 2) {
    // HALF WEEKS, BECAUSE WHOLE ONES WERE ROUNDING THE ARITHMETIC OUT OF REACH.
    // The body wash lasts 0.833 of a month. That is 3.6 weeks, it was printed
    // as "about 4 weeks", and the monthly figure beside it is ₹598 ÷ 0.833 =
    // ₹718 — which does not divide out of anything on the card. ₹598 over four
    // weeks is ₹641. The whole reason this label exists is to let somebody
    // check the number next to it, so a rounding that breaks the check breaks
    // the feature. Halves put the error inside the word "about".
    const weeks = Math.max(1, Math.round(months * 4.345 * 2) / 2);
    const shown = Number.isInteger(weeks) ? String(weeks) : `${Math.floor(weeks)}½`;
    return `about ${shown} week${weeks === 1 ? '' : 's'}`;
  }
  const halves = Math.round(months * 2) / 2;
  const shown = Number.isInteger(halves) ? String(halves) : `${Math.floor(halves)}½`;
  return `about ${shown} months`;
}
