import type { ComposedDay, DayTargets, ClinicalCaps } from './meal-composer';
import { normCuisine } from './meal-composer';

/**
 * Dual plan scoring — every generated plan is graded on TWO independent axes so
 * the user can see the trade-off between the two modes:
 *
 *   • health      (0–100): how clinically/nutritionally correct the plan is —
 *                  alignment to the calorie/protein/fibre prescription and to the
 *                  medical caps (clinical caps for a diagnosed user, otherwise the
 *                  general WHO guideline caps for a healthy adult). The Optimal
 *                  Health plan enforces these, so it should score ~100.
 *
 *   • preference  (0–100): how faithfully the plan reflects the user's SAVED Food
 *                  Preference Profile — their diet, chosen protein sources, chosen
 *                  cuisines and cook-time preference. The My Preferences plan is
 *                  built from these, so it should score ~100; Optimal Health drops
 *                  the protein-source/cook-time bias to chase health, so it scores
 *                  lower here.
 *
 * "Optimal is correct, My Preferences is yours" — the two scores make the
 * difference explicit instead of forcing one plan on the user.
 */

export interface ScoreNote { key: string; label: string; detail: string; severity: 'ok' | 'info' | 'warn' }
export interface DualScore {
  health: number;
  preference: number;
  healthNotes: ScoreNote[];
  preferenceNotes: ScoreNote[];
}

export interface ScoreInputs {
  targets: DayTargets;
  /** The yardstick both plans are measured against: clinical caps if the user has
   *  a condition, else general guideline caps. */
  healthCaps?: ClinicalCaps;
  isDiabetic: boolean;
  /** Saved-profile signals used for the preference-match score. */
  favourites: string[];   // chosen protein sources / meats
  cuisines: string[];     // chosen cuisines (any label; normalised here)
  maxMinutes?: number;    // cook-time preference
}

/** General WHO-style guideline caps for a healthy adult, scaled to their calories.
 *  Sodium 2300 mg; added sugar <10% kcal; saturated fat <10% kcal. */
export function guidelineCaps(kcal: number): ClinicalCaps {
  return {
    sodiumMg: 2300,
    sugarG: Math.max(25, Math.round((kcal * 0.10) / 4)),
    satFatG: Math.max(15, Math.round((kcal * 0.10) / 9)),
  };
}

interface Avg { kcal: number; protein: number; carbs: number; fiber: number; sodiumMg: number; addedSugarG: number; satFatG: number; potassiumMg: number; phosphorusMg: number }
function averageDay(days: ComposedDay[]): Avg {
  const n = days.length || 1;
  const s = days.reduce((a, d) => ({
    kcal: a.kcal + d.totals.kcal, protein: a.protein + d.totals.protein, carbs: a.carbs + d.totals.carbs, fiber: a.fiber + d.totals.fiber,
    sodiumMg: a.sodiumMg + d.totals.sodiumMg, addedSugarG: a.addedSugarG + d.totals.addedSugarG, satFatG: a.satFatG + d.totals.satFatG,
    potassiumMg: a.potassiumMg + d.totals.potassiumMg, phosphorusMg: a.phosphorusMg + d.totals.phosphorusMg,
  }), { kcal: 0, protein: 0, carbs: 0, fiber: 0, sodiumMg: 0, addedSugarG: 0, satFatG: 0, potassiumMg: 0, phosphorusMg: 0 });
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / n])) as unknown as Avg;
}

function healthScore(days: ComposedDay[], targets: DayTargets, caps: ClinicalCaps | undefined, isDiabetic: boolean): { score: number; notes: ScoreNote[] } {
  const avg = averageDay(days);
  const notes: ScoreNote[] = [];
  let penalty = 0;

  const over = (key: string, label: string, value: number, cap: number | undefined, unit: string, weight: number) => {
    if (!cap) return;
    const deltaPct = Math.round(((value - cap) / cap) * 100);
    if (deltaPct > 5) {
      notes.push({ key, label, severity: deltaPct > 25 ? 'warn' : 'info', detail: `${label} ${Math.round(value)} vs ${Math.round(cap)} ${unit} (+${deltaPct}%)` });
      penalty += Math.min(26, deltaPct * 0.6) * weight;
    }
  };
  const under = (key: string, label: string, value: number, target: number, unit: string) => {
    const deltaPct = Math.round(((target - value) / Math.max(1, target)) * 100);
    if (deltaPct > 8) {
      notes.push({ key, label, severity: deltaPct > 25 ? 'warn' : 'info', detail: `${label} ${Math.round(value)} vs ${Math.round(target)} ${unit} (−${deltaPct}%)` });
      penalty += Math.min(20, deltaPct * 0.5);
    }
  };

  const kcalDev = Math.abs(avg.kcal - targets.kcal) / Math.max(1, targets.kcal);
  if (kcalDev > 0.10) { const p = Math.round(kcalDev * 100); notes.push({ key: 'kcal', label: 'Calories', severity: kcalDev > 0.2 ? 'warn' : 'info', detail: `${Math.round(avg.kcal)} vs ${Math.round(targets.kcal)} kcal (${avg.kcal > targets.kcal ? '+' : '−'}${p}%)` }); penalty += Math.min(15, p * 0.3); }
  under('protein', 'Protein', avg.protein, targets.protein, 'g');
  under('fiber', 'Fibre', avg.fiber, targets.fiber, 'g');
  over('sodium', 'Sodium', avg.sodiumMg, caps?.sodiumMg, 'mg', 1);
  over('addedSugar', 'Added sugar', avg.addedSugarG, caps?.sugarG, 'g', 1.2);
  over('satFat', 'Saturated fat', avg.satFatG, caps?.satFatG, 'g', 1);
  over('potassium', 'Potassium', avg.potassiumMg, caps?.potassiumMg, 'mg', 1.4);
  over('phosphorus', 'Phosphorus', avg.phosphorusMg, caps?.phosphorusMg, 'mg', 1.4);
  if (isDiabetic) {
    const deltaPct = Math.round(((avg.carbs - targets.carbs) / Math.max(1, targets.carbs)) * 100);
    if (deltaPct > 12) { notes.push({ key: 'carbs', label: 'Carbohydrates', severity: deltaPct > 30 ? 'warn' : 'info', detail: `${Math.round(avg.carbs)} vs ${Math.round(targets.carbs)} g (+${deltaPct}%) — glycemic load` }); penalty += Math.min(20, deltaPct * 0.5); }
  }

  return { score: Math.max(0, Math.min(100, Math.round(100 - penalty))), notes };
}

function preferenceScore(days: ComposedDay[], inp: ScoreInputs): { score: number; notes: ScoreNote[] } {
  const notes: ScoreNote[] = [];
  const comps = days.flatMap((d) => d.meals.flatMap((m) => m.components));
  const proteinComps = comps.filter((c) => c.role === 'main' || c.role === 'dal');
  const mains = comps.filter((c) => c.role === 'main');

  // Each applicable factor contributes a 0–100 value with a weight; the score is
  // the weight-normalised average over the factors that actually apply to this user.
  const factors: Array<{ w: number; v: number }> = [];

  const favs = inp.favourites.map((f) => f.toLowerCase()).filter(Boolean);
  if (favs.length && proteinComps.length) {
    const hit = proteinComps.filter((c) => {
      const hay = `${c.name} ${c.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
      return favs.some((f) => hay.includes(f));
    }).length;
    const v = Math.round((hit / proteinComps.length) * 100);
    factors.push({ w: 45, v });
    notes.push({ key: 'protein', label: 'Chosen protein sources', severity: v >= 70 ? 'ok' : v >= 40 ? 'info' : 'warn', detail: `${hit}/${proteinComps.length} protein dishes from your picks (${v}%)` });
  }

  const chosenCuisines = inp.cuisines.map((c) => normCuisine(c)).filter(Boolean);
  if (chosenCuisines.length && mains.length) {
    const hit = mains.filter((c) => c.cuisine && chosenCuisines.includes(normCuisine(c.cuisine))).length;
    const v = Math.round((hit / mains.length) * 100);
    factors.push({ w: 35, v });
    notes.push({ key: 'cuisine', label: 'Chosen cuisines', severity: v >= 70 ? 'ok' : v >= 40 ? 'info' : 'warn', detail: `${hit}/${mains.length} mains in your cuisines (${v}%)` });
  }

  if (inp.maxMinutes && comps.length) {
    const hit = comps.filter((c) => c.minutes <= (inp.maxMinutes as number)).length;
    const v = Math.round((hit / comps.length) * 100);
    factors.push({ w: 15, v });
    if (v < 90) notes.push({ key: 'time', label: 'Cook-time preference', severity: v >= 70 ? 'info' : 'warn', detail: `${v}% of dishes within ${inp.maxMinutes} min` });
  }

  // No explicit preferences to diverge on → the plan trivially matches the profile.
  if (!factors.length) return { score: 100, notes };

  const wSum = factors.reduce((t, f) => t + f.w, 0);
  const score = Math.round(factors.reduce((t, f) => t + f.v * f.w, 0) / wSum);
  return { score, notes };
}

/** Grade a plan on both axes. */
export function scoreDual(days: ComposedDay[], inp: ScoreInputs): DualScore {
  const h = healthScore(days, inp.targets, inp.healthCaps, inp.isDiabetic);
  const p = preferenceScore(days, inp);
  return { health: h.score, preference: p.score, healthNotes: h.notes.slice(0, 6), preferenceNotes: p.notes.slice(0, 6) };
}

export interface Scorecard {
  mode: 'preferred' | 'optimal';
  health: number;
  preference: number;
  healthNotes: ScoreNote[];
  preferenceNotes: ScoreNote[];
  /** The counterpart plan's two scores, so a tab can render the difference. */
  other: { mode: 'preferred' | 'optimal'; health: number; preference: number };
  /** One-line, human "here's the difference between the two plans". */
  summary: string;
}

/** Build the scorecard (with the compare line) for the plan in `mode`, given both
 *  modes' dual scores. Always frames the difference the same way regardless of
 *  which tab is active. */
export function buildScorecard(
  mode: 'preferred' | 'optimal',
  preferred: DualScore,
  optimal: DualScore,
): Scorecard {
  const self = mode === 'optimal' ? optimal : preferred;
  const otherMode: 'preferred' | 'optimal' = mode === 'optimal' ? 'preferred' : 'optimal';
  const other = mode === 'optimal' ? preferred : optimal;

  // The health gap is always "how much healthier Optimal is"; the preference gap is
  // "how much closer My Preferences is to the profile".
  const healthGap = optimal.health - preferred.health;
  const prefGap = preferred.preference - optimal.preference;
  const topHealth = preferred.healthNotes.slice(0, 2).map((n) => n.label.toLowerCase());
  const reason = topHealth.length ? ` — mainly ${topHealth.join(' & ')}` : '';

  let summary: string;
  if (healthGap <= 2 && prefGap <= 2) {
    summary = `Both plans are close: Optimal Health scores ${optimal.health}/100 for health and ${optimal.preference}/100 for preference match; My Preferences ${preferred.health}/100 and ${preferred.preference}/100. Your tastes already line up well with the clinical ideal.`;
  } else {
    summary = `Optimal Health scores ${optimal.health}/100 on health vs ${preferred.health}/100 for My Preferences${healthGap > 3 ? reason : ''}. My Preferences matches your saved profile ${preferred.preference}/100 vs ${optimal.preference}/100 for Optimal Health. Optimal is the clinically ideal plan; My Preferences is built around your choices.`;
  }

  return {
    mode,
    health: self.health,
    preference: self.preference,
    healthNotes: self.healthNotes,
    preferenceNotes: self.preferenceNotes,
    other: { mode: otherMode, health: other.health, preference: other.preference },
    summary,
  };
}
