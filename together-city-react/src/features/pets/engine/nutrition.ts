/**
 * ── THE FEEDING ENGINE ──────────────────────────────────────────────────────
 *
 * One module decides how much an animal eats, and everything else in the hub —
 * today's plan, the weekly planner, the shopping list, the subscription
 * countdown — is arithmetic downstream of it. That is deliberate: a portion
 * shown on the meal card and a quantity written on the shopping list that were
 * computed in two places are two numbers that will eventually disagree, and the
 * owner will believe the one that is wrong.
 *
 * THE METHOD IS THE RER-MULTIPLIER METHOD, AND ONLY THAT.
 *
 *   RER = 70 × (kg)^0.75          — Merck Veterinary Manual
 *   MER = RER × factor            — Merck's maintenance-energy table
 *
 * There is a second, equally respectable system in the literature: WSAVA and
 * FEDIAF publish direct NRC-2006 equations that skip RER entirely. The two must
 * never be blended — a factor from one applied to a base from the other is a
 * number with no source at all. Everything here is Merck/AAHA, and `evidence.ts`
 * carries the quote for each constant.
 *
 * WEIGHT LOSS IS THE ONE CASE THAT DOES NOT USE THE PET'S WEIGHT. AAHA is
 * explicit: the base is `70 × (IDEAL kg)^0.75`, fed at 80% of that ideal-weight
 * RER. Feeding a multiplier of the CURRENT weight of an overweight animal is
 * how a "weight management plan" maintains the weight it was written to remove.
 *
 * WHAT THIS ENGINE WILL NOT DO. It will not convert calories into grams of a
 * commercial food whose kcal/kg the retailer never published — and most Indian
 * retail listings do not publish one. `portionFor()` returns null in that case
 * and the meal card prints the pack's own feeding guide instead of a gram
 * figure invented to fill the space.
 */

import type { ActivityLevel, Goal, Pet, Species } from '../types';
import { EVIDENCE } from '../data/evidence';
import { DENSITY, type FoodForm } from '../data/density';
import { findBreed } from '../data/breeds';

/** Merck's exponential form. The linear approximation is only valid 2–45 kg,
 *  and since we have Math.pow there is no reason to carry the approximation. */
export const rer = (kg: number) => 70 * Math.pow(Math.max(kg, 0.2), 0.75);

export interface AgeRead {
  months: number | null;
  years: number | null;
  stage: 'puppy' | 'kitten' | 'adult' | 'senior' | 'unknown';
  label: string;
}

/** Age is derived from the birthday every time it is read, so a plan made in
 *  March does not still believe the puppy is four months old in November. */
export function readAge(pet: Pet, today = new Date()): AgeRead {
  let months = pet.ageMonths;
  if (pet.dob) {
    const d = new Date(pet.dob);
    months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
    if (today.getDate() < d.getDate()) months -= 1;
  }
  if (months === null || Number.isNaN(months)) {
    return { months: null, years: null, stage: 'unknown', label: 'Age not set' };
  }
  const years = months / 12;
  const breed = findBreed(pet.species, pet.breed);
  const youngMonths = breed?.puppyMonths ?? (pet.species === 'dog' ? 12 : 12);
  const seniorYears = breed?.seniorYears ?? (pet.species === 'dog' ? 8 : 10);
  const stage: AgeRead['stage'] =
    months < youngMonths ? (pet.species === 'dog' ? 'puppy' : 'kitten')
    : years >= seniorYears ? 'senior'
    : 'adult';
  const label =
    months < 24
      ? `${months} month${months === 1 ? '' : 's'}`
      : `${Math.floor(years)} year${Math.floor(years) === 1 ? '' : 's'}`;
  return { months, years, stage, label };
}

export interface EnergyRead {
  rerKcal: number;
  merKcal: number;
  factor: number;
  factorKey: string;
  factorLabel: string;
  basis: 'current-weight' | 'ideal-weight';
  basisKg: number;
  citation: { source: string; url: string; quote: string | null };
  /** Set when the plan is a weight plan — what the target implies per week. */
  weightNote: string | null;
}

const factorRow = (species: Species, key: string) =>
  EVIDENCE.factors[species].find((f) => f.key === key) ?? null;

/**
 * WHICH MULTIPLIER, AND WHY THAT ONE.
 *
 * The order of these tests is the whole rule and is worth reading top to
 * bottom: growth beats everything (a growing puppy on a weight-loss factor is
 * a welfare problem), then an explicit weight goal, then neuter status, then
 * activity. Activity is LAST on purpose — Merck's table is built on neuter
 * status, not on how much the dog runs, and the research could not verify a
 * working-dog multiplier from an authoritative page, so "high activity" nudges
 * within the verified range rather than inventing a factor above it.
 */
export function energyFor(pet: Pet, today = new Date()): EnergyRead {
  const age = readAge(pet, today);
  const weight = pet.weightKg ?? 0;

  let key: string;
  let basis: EnergyRead['basis'] = 'current-weight';
  let basisKg = weight;
  let weightNote: string | null = null;

  if (age.stage === 'puppy' || age.stage === 'kitten') {
    key = pet.species === 'dog'
      ? ((age.months ?? 12) < 4 ? 'puppy0to4Months' : 'puppy4MonthsToAdult')
      : 'kitten';
  } else if (pet.goal === 'weight-loss' || (pet.bodyCondition === 'over' && pet.goal !== 'weight-gain')) {
    key = 'weightLoss';
    basis = 'ideal-weight';
    basisKg = pet.targetWeightKg ?? Math.round(weight * 0.85 * 10) / 10;
    const toLose = Math.max(weight - basisKg, 0);
    const rate = pet.species === 'dog' ? 0.015 : 0.01;      // AAHA: 1–2% / wk dog, 0.5–2% / wk cat
    const weeks = toLose > 0 ? Math.ceil(toLose / (weight * rate)) : 0;
    weightNote = toLose > 0
      ? `${toLose.toFixed(1)} kg to lose. At a safe ${pet.species === 'dog' ? '1–2%' : '0.5–2%'} of body weight a week that is about ${weeks} week${weeks === 1 ? '' : 's'}. Faster is not better — in cats, rapid loss risks hepatic lipidosis.`
      : null;
  } else if (
    pet.goal === 'weight-gain'
    || pet.bodyCondition === 'under'
    // A target ABOVE the current weight is a gain plan even when the goal
    // select still says "maintain" — the two fields disagreed on a real
    // profile (2.6 kg cat, 3.1 kg target) and the plan quietly fed for
    // maintenance. The number the owner typed wins over the dropdown they
    // left alone.
    || (pet.targetWeightKg !== null && pet.weightKg !== null && pet.targetWeightKg > pet.weightKg + 0.2)
  ) {
    key = 'weightGain';
  } else if (pet.sterilised === false) {
    key = 'intactAdult';
  } else if (age.stage === 'senior' || pet.activity === 'low') {
    key = 'inactiveObeseProne';
  } else {
    key = 'neuteredAdult';
  }

  const row = factorRow(pet.species, key) ?? factorRow(pet.species, 'neuteredAdult');
  let factor = typeof row?.factor === 'number' ? row.factor : pet.species === 'dog' ? 1.6 : 1.2;

  // The verified table has no working-dog row. A very active adult is fed at
  // the intact-adult figure at most — a real number from the same table rather
  // than an invented one above it.
  if (age.stage === 'adult' && pet.activity === 'high' && (key === 'neuteredAdult' || key === 'inactiveObeseProne')) {
    factor = pet.species === 'dog' ? 1.8 : 1.4;
  }

  const base = rer(basisKg);
  return {
    rerKcal: Math.round(base),
    merKcal: Math.round(key === 'weightLoss' ? base * 0.8 : base * factor),
    factor: key === 'weightLoss' ? 0.8 : factor,
    factorKey: key,
    factorLabel: row?.label ?? 'Adult maintenance',
    basis,
    basisKg,
    citation: {
      source: row?.source ?? EVIDENCE.rer.exponentialSource,
      url: row?.url ?? EVIDENCE.rer.exponentialSourceUrl,
      quote: row?.quote ?? null,
    },
    weightNote,
  };
}

/** UC Davis, WSAVA, VCA: treats no more than 10% of daily calories. */
export const treatAllowance = (merKcal: number) => Math.round(merKcal * 0.1);

/**
 * WATER. Cornell's Riney centre gives 40–60 mL/kg/day for dogs and the Feline
 * Health Center gives roughly 4 oz per 5 lb lean body weight for cats — about
 * 52 mL/kg. The range is returned rather than a single number because a single
 * number would be a precision nobody measured, and because wet food moves it:
 * a cat eating pouches drinks visibly less and is not dehydrated.
 */
export function waterMl(pet: Pet): [number, number] {
  const kg = pet.weightKg ?? 0;
  if (!kg) return [0, 0];
  return pet.species === 'dog'
    ? [Math.round(kg * 40), Math.round(kg * 60)]
    : [Math.round(kg * 45), Math.round(kg * 60)];
}

/**
 * MEALS A DAY. VCA gives 3–4 for young puppies and 2–3 generally; the famous
 * age ladder (4 meals at 6–12 weeks, 3 at 3–6 months, 2 after) could not be
 * found on any authoritative page, so it is not encoded. Adults get two, which
 * every source fetched supports, and kittens get four.
 */
export function mealsPerDay(pet: Pet, today = new Date()): number {
  const age = readAge(pet, today);
  if (age.stage === 'puppy') return (age.months ?? 12) < 4 ? 4 : 3;
  if (age.stage === 'kitten') return 4;
  if (pet.species === 'cat') return 3;
  return 2;
}

/** Feeding times, spread across a working day and returned in the reader's
 *  order. Three meals is breakfast / afternoon / dinner, not three dinners. */
export function mealTimes(count: number): string[] {
  if (count >= 4) return ['7:30 am', '12:00 pm', '4:30 pm', '8:30 pm'];
  if (count === 3) return ['7:30 am', '1:30 pm', '8:00 pm'];
  return ['8:00 am', '7:30 pm'];
}

/**
 * CALORIES → GRAMS, or nothing at all.
 *
 * Returns null when the product's energy density is unknown, which in this
 * catalogue is the common case. The caller must handle null by showing the
 * pack's own feeding chart. Filling it with a guess is the failure this
 * signature exists to prevent.
 */
export function portionFor(kcal: number, kcalPerKg: number | null): number | null {
  if (!kcalPerKg || kcalPerKg <= 0) return null;
  return Math.round((kcal / kcalPerKg) * 1000);
}

export interface PortionRead {
  /** Exact grams, when the product published its energy density. */
  grams: number | null;
  /** A gram range from the published density band — see data/density.ts. */
  range: [number, number] | null;
  estimated: boolean;
  basis: string;
}

/**
 * WHAT TO PUT IN THE BOWL.
 *
 * Exact when the listing published kcal/kg; otherwise a range off the AAFCO
 * band, marked as an estimate and carrying its own basis line. The third state
 * — neither — happens only for a food we cannot even classify as dry or wet,
 * and it still says something ("use the pack's guide for N kcal") rather than
 * nothing.
 */
export function portionRead(
  kcal: number,
  kcalPerKg: number | null,
  species: Species,
  form: FoodForm,
): PortionRead {
  const exact = portionFor(kcal, kcalPerKg);
  if (exact !== null) {
    return { grams: exact, range: null, estimated: false, basis: `${kcalPerKg} kcal/kg, published on the listing` };
  }
  if (form === 'dry' || form === 'wet') {
    const band = DENSITY[form][species];
    // High density → fewer grams, so the LOW gram figure comes from the HIGH kcal.
    const low = Math.round((kcal / band.high) * 1000);
    const high = Math.round((kcal / band.low) * 1000);
    return {
      grams: null,
      range: [low, high],
      estimated: true,
      basis: `${band.low.toLocaleString('en-IN')}–${band.high.toLocaleString('en-IN')} kcal/kg assumed`,
    };
  }
  return { grams: null, range: null, estimated: false, basis: '' };
}

/** Body-condition wording. WSAVA: 4–5 of 9 is ideal; each point above ideal is
 *  roughly 10% over ideal body weight (AAHA 2014). */
export function bodyConditionRead(pet: Pet): { label: string; tone: 'ok' | 'warn' | 'danger'; note: string } {
  if (pet.bodyCondition === 'ideal') {
    return { label: 'Ideal body condition', tone: 'ok', note: 'Ribs easily felt under a light fat cover, waist visible from above, tuck visible from the side.' };
  }
  if (pet.bodyCondition === 'over') {
    return { label: 'Above ideal weight', tone: 'warn', note: 'Each body-condition point above ideal is about 10% over ideal body weight. Your vet can score this properly in a minute.' };
  }
  return { label: 'Below ideal weight', tone: 'warn', note: 'Ribs, spine or hips visible with no fat cover. Worth a vet check before adding calories — weight loss can be a symptom.' };
}

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  low: 'Low — short walks, mostly indoors',
  moderate: 'Moderate — a daily walk and play',
  high: 'High — long walks, running, sport',
};

export const GOAL_LABEL: Record<Goal, string> = {
  maintain: 'Maintain a healthy weight',
  'weight-loss': 'Weight management',
  'weight-gain': 'Healthy weight gain',
  growth: 'Healthy growth',
  senior: 'Senior nutrition',
  wellness: 'General wellness',
};
