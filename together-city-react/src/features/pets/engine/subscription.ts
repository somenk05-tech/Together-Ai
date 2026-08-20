/**
 * ── NEVER RUN OUT ───────────────────────────────────────────────────────────
 *
 * The countdown is arithmetic on three numbers: how much food is in the pack,
 * how much this pet eats a day, and when the pack was opened. Two of those we
 * know. The third — grams per day — needs the food's energy density, and most
 * Indian retail listings do not publish one.
 *
 * SO THE ANSWER HAS THREE STATES AND NOT TWO. It runs out on a date; or it runs
 * out on a date the owner told us by saying how much they scoop; or we do not
 * know and we ask, rather than guessing and reminding somebody to reorder two
 * weeks after their dog ran out of food.
 */

import type { NutritionPlan, Product, SubscriptionCadence } from '../types';
import { portionFor } from './nutrition';

export const CADENCES: { key: SubscriptionCadence; label: string; days: number }[] = [
  { key: 'weekly', label: 'Every week', days: 7 },
  { key: 'fortnightly', label: 'Every 2 weeks', days: 14 },
  { key: 'monthly', label: 'Every month', days: 30 },
  { key: 'six-weekly', label: 'Every 6 weeks', days: 42 },
  { key: 'two-monthly', label: 'Every 2 months', days: 60 },
];

/** Grams in a pack string: '3kg', '1.2 kg', '480g', '14x80g'. Null if unclear. */
export function packGrams(pack: string | null): number | null {
  if (!pack) return null;
  const multi = pack.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g)/i);
  if (multi) {
    const each = parseFloat(multi[2]) * (multi[3].toLowerCase() === 'kg' ? 1000 : 1);
    return Math.round(parseInt(multi[1], 10) * each);
  }
  const one = pack.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!one) return null;
  return Math.round(parseFloat(one[1]) * (one[2].toLowerCase() === 'kg' ? 1000 : 1));
}

export interface RunOut {
  gramsPerDay: number | null;
  daysLeft: number | null;
  runsOut: string | null;
  suggested: SubscriptionCadence | null;
  unknownReason: string | null;
}

export function runOut(
  product: Product,
  variantIndex: number,
  plan: NutritionPlan | null,
  openedOn: Date = new Date(),
  manualGramsPerDay: number | null = null,
): RunOut {
  const pack = packGrams(product.variants[variantIndex]?.pack ?? product.packSizes[0] ?? null);
  const mealKcal = plan ? plan.merKcal - plan.treatKcal : null;
  const fromPlan = mealKcal !== null ? portionFor(mealKcal, product.nutrition.kcalPerKg) : null;
  const gramsPerDay = manualGramsPerDay ?? fromPlan;

  if (!pack) {
    return { gramsPerDay, daysLeft: null, runsOut: null, suggested: null, unknownReason: 'Pack size is not stated on the source listing.' };
  }
  if (!gramsPerDay) {
    return {
      gramsPerDay: null, daysLeft: null, runsOut: null, suggested: null,
      unknownReason: 'This listing does not publish the food’s calories per kilogram, so we cannot work out a daily amount. Tell us how many grams you feed and the countdown starts.',
    };
  }
  const daysLeft = Math.floor(pack / gramsPerDay);
  const date = new Date(openedOn);
  date.setDate(date.getDate() + daysLeft);
  const suggested = CADENCES.reduce((best, c) =>
    Math.abs(c.days - daysLeft) < Math.abs(best.days - daysLeft) ? c : best, CADENCES[2]).key;
  return { gramsPerDay, daysLeft, runsOut: date.toISOString().slice(0, 10), suggested, unknownReason: null };
}

/** Subscribe & save is a commercial promise, so the number is a placeholder the
 *  merchant sets — not a discount this file is entitled to invent. */
export const SUBSCRIBE_SAVE_NOTE =
  'Subscription pricing is set per merchant and is not published on the source listings, so no discount is shown here.';
