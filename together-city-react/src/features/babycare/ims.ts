/**
 * ══ THE ONE LAW THIS SHOP IS BUILT AROUND ═══════════════════════════════════
 *
 * The Infant Milk Substitutes, Feeding Bottles and Infant Foods (Regulation of
 * Production, Supply and Distribution) Act, 1992, as amended 2003 — the IMS
 * Act. India does not merely discourage the marketing of infant formula: it
 * makes it a criminal offence, punishable by up to three years' imprisonment.
 *
 *   s.3  No person shall ADVERTISE, or take part in the publication of any
 *        advertisement for the distribution, sale or supply of infant milk
 *        substitutes, feeding bottles or infant foods; nor give an impression
 *        that they are equivalent to or better than mother's milk; nor TAKE
 *        PART IN THE PROMOTION of any of them.
 *   s.4  No samples, no gifts, no CONTACT WITH A PREGNANT WOMAN OR THE MOTHER
 *        OF AN INFANT for the purpose of promotion, no inducement of any kind.
 *   s.2  The scope is UP TO TWO YEARS OF AGE — "infant milk substitute" is a
 *        replacement for mother's milk for an infant up to two; "infant food"
 *        is a complement to it from six months to two years; "feeding bottle"
 *        is any bottle or receptacle used to feed an infant milk substitute.
 *
 *   Statute: https://www.indiacode.nic.in/bitstream/123456789/1958/1/aA1992-41.pdf
 *
 * THIS IS NOT THEORETICAL FOR AN APP. BPNI's own violations log records a
 * complaint filed against PharmEasy on 28 October 2021 for "promoting the sale
 * of infant milk substitute by giving discount", and against Amazon and
 * Snapdeal for online retail of these products. An online store that puts a
 * discount badge on a tin of Stage 1 formula is the exact fact pattern.
 *   https://www.bpni.org/documentation-violations-under-ims-act/
 *
 * ── WHAT THE CITY DOES ABOUT IT ─────────────────────────────────────────────
 *
 * SELLING IS LAWFUL; PROMOTING IS NOT. So a restricted row is listed plainly —
 * name, pack, price, source — and is cut out of every surface whose job is to
 * make somebody want something:
 *
 *   · no discount badge, no "% off", no struck-through MRP
 *   · no ranking, no bestseller, no "picked for you", no trending
 *   · no banner, no carousel, no cross-sell, no bundle
 *   · no essentials checklist entry, no notification, no reason line
 *
 * `mayAdvertise()` is the single answer to that question and every surface in
 * this hub calls it. `the-store-that-may-not-advertise.test.ts` reads this file
 * and the pages, and fails the build if a surface stops asking.
 *
 * ── WHY IT IS DERIVED AND NOT A COLUMN ──────────────────────────────────────
 *
 * A boolean typed into 323 catalogue rows is 323 chances to forget one, and the
 * 324th row would arrive with the field unset and default to advertisable —
 * failing open on a criminal statute. Deriving it from the product's `sub`
 * means a new subcategory nobody classified is unknown, and unknown FAILS
 * CLOSED: `mayAdvertise` returns false. The guard test then names it.
 *
 * ── THE JUDGEMENT CALLS, STATED RATHER THAN HIDDEN ──────────────────────────
 *
 * · SIPPY CUPS AND FOOD FEEDERS ARE RESTRICTED. The Act's words are "bottle or
 *   receptacle", and these are receptacles a six-month-old is fed from. No
 *   source we read says they are in scope. We restrict them anyway, because the
 *   cost of being wrong in that direction is one sippy cup that never appears
 *   in a carousel, and the cost of being wrong the other way is a prosecution.
 * · NANGROW IS NOT RESTRICTED. Its own page sells it for 2-5 years, and the
 *   statute's scope ends at two. The age the seller prints is what decides it.
 * · BREAST PUMPS, STERILISERS, MILK STORAGE BAGS AND NURSING PADS ARE NOT
 *   RESTRICTED. They support breastfeeding rather than substitute for it; the
 *   Act's subject is the substitute.
 * · LUNCH BOXES, SNACK BOXES, HIGH CHAIRS AND KIDS' WATER BOTTLES ARE NOT
 *   RESTRICTED. A 500 ml steel water bottle for a school bag is not a feeding
 *   bottle in any reading of s.2.
 *
 * We are not lawyers and this file does not pretend to be advice. It is the
 * reading the city acts on, written down where it can be argued with.
 */

import type { BabyProduct } from './types';

/**
 * THE SUBCATEGORIES INSIDE THE ACT'S SCOPE.
 *
 * Read against `BabyProduct.sub`, which is the seller's own word for the thing.
 * Everything in the feeding aisle is either in this set or in the one below;
 * anything in neither is UNKNOWN and refused.
 */
export const IMS_SUBS: readonly string[] = [
  'Infant formula',
  'Follow-up formula',
  'Infant cereal',
  'Porridge mix',
  'Puree pouch',
  'Puree',
  'Feeding bottle',
  'Teat',
  'Sippy cup',
  'Food feeder',
];

/**
 * FEEDING-AISLE SUBCATEGORIES DELIBERATELY OUTSIDE IT.
 *
 * Written down rather than left as "everything else" so that the guard can tell
 * a considered exclusion from a subcategory nobody has looked at yet. That
 * difference is the whole reason this fails closed.
 */
export const NON_IMS_FEEDING_SUBS: readonly string[] = [
  'Growing-up drink',
  'Steriliser',
  'Breast pump',
  'Nursing pads',
  'Milk storage',
  'Bib',
  'Lunch box',
  'Snack box',
  'Kids bottle',
  'High chair',
  'Booster seat',
  'Kids chair',
];

const RESTRICTED = new Set(IMS_SUBS);
const CLEARED = new Set(NON_IMS_FEEDING_SUBS);

/**
 * IS THIS ROW INSIDE THE IMS ACT'S SCOPE?
 *
 * Only the feeding aisle can be — a stroller is not an infant milk substitute
 * however it is described — and inside it, the seller's own subcategory
 * decides. An unrecognised feeding subcategory is treated as restricted.
 */
export function isImsProduct(p: BabyProduct): boolean {
  if (p.aisle !== 'feeding') return false;
  if (RESTRICTED.has(p.sub)) return true;
  if (CLEARED.has(p.sub)) return false;
  return true; // unknown: fail closed
}

/**
 * MAY ANY SURFACE PROMOTE THIS PRODUCT?
 *
 * The one question, asked in one place. Ranking, badging, bundling,
 * recommending, discounting and putting a thing in a checklist all call this
 * and skip the row when it answers false.
 */
export function mayAdvertise(p: BabyProduct): boolean {
  return !isImsProduct(p);
}

/**
 * WHY A ROW IS RESTRICTED, IN WORDS A PARENT READS.
 *
 * Shown on the product itself, because a shelf that quietly suppresses a price
 * comparison and says nothing looks broken rather than lawful.
 */
export function imsReason(p: BabyProduct): string | null {
  if (!isImsProduct(p)) return null;
  return 'India’s IMS Act 1992 forbids advertising or promoting infant formula, '
    + 'infant food and feeding bottles for children under two. Together City lists '
    + 'this product and its price, and never ranks, badges, discounts or recommends it.';
}

/** The notice the feeding aisle carries above itself. */
export const IMS_NOTICE = 'Mother’s milk is best for your baby.';

/**
 * THE ROWS THE CITY MAY WORK WITH.
 *
 * Every ranked, badged or curated list in this hub is built from this and not
 * from the catalogue. It is a function rather than a constant so that the guard
 * can see the call site — and so that no page can accidentally close over the
 * unfiltered array.
 */
export function advertisable(products: BabyProduct[]): BabyProduct[] {
  return products.filter(mayAdvertise);
}
