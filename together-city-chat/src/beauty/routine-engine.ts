import type { RecommendedProduct } from './beauty-engine';

/**
 * Turning a shelf of recommended products into a routine somebody can follow.
 *
 * The recommendation engine answers "what should I own". This answers the
 * question people actually ask next — "so what do I do, in what order, and when"
 * — which is the whole of brief item 22.
 *
 * Pure on purpose: no database, no profile lookup, no clock. Ordering and the
 * safety rules are the part worth testing, and they are testable directly.
 */

export type TimeOfDay = 'morning' | 'evening' | 'weekly';

export interface RoutineStep {
  order: number;
  /** What this step is for, in the language people use: Cleanse, Treat, Protect. */
  step: string;
  productId: string;
  name: string;
  brand: string;
  category: string;
  keyIngredient: string;
  priceInr: number;
  instructions: string;
  frequency: string;
  /** Things that could go wrong with THIS product in THIS routine. */
  warnings: string[];
}

export interface Routine {
  timeOfDay: TimeOfDay;
  title: string;
  steps: RoutineStep[];
  /** Notes about the routine as a whole rather than any single step. */
  notes: string[];
}

/**
 * Application order. Thin, watery things first; the things that seal go last.
 * Sunscreen is always last in the morning — under anything else it stops working.
 */
const ORDER: Array<{ match: RegExp; step: string; rank: number; instructions: string }> = [
  { match: /cleanser/i, step: 'Cleanse', rank: 10, instructions: 'Massage into damp skin for 30 seconds, then rinse with lukewarm water.' },
  { match: /toner|tonic/i, step: 'Prep', rank: 20, instructions: 'Sweep over clean skin and let it absorb before the next step.' },
  { match: /serum/i, step: 'Treat', rank: 30, instructions: 'Two or three drops on slightly damp skin; press in rather than rub.' },
  { match: /treatment/i, step: 'Treat', rank: 40, instructions: 'A pea-sized amount over the whole face, avoiding the eye area.' },
  { match: /moisturiser|cream/i, step: 'Moisturise', rank: 50, instructions: 'Seal everything underneath while skin is still slightly damp.' },
  { match: /sunscreen/i, step: 'Protect', rank: 90, instructions: 'Two fingers’ length for the face and neck, as the last step. Reapply if you are out for hours.' },
  { match: /haircare/i, step: 'Hair', rank: 60, instructions: 'Apply to the scalp, not the lengths, and massage in.' },
];

function classify(p: RecommendedProduct) {
  return ORDER.find((o) => o.match.test(p.category)) ?? { step: 'Treat', rank: 45, instructions: 'Apply a thin, even layer.' };
}

/** Which routines a product belongs in, read from its own usage string. */
function slotsFor(usage: string): TimeOfDay[] {
  const u = usage.toLowerCase();
  if (u.includes('weekly')) return ['weekly'];
  if (u.includes('morning') && u.includes('night')) return ['morning', 'evening'];
  if (u.includes('night')) return ['evening'];
  if (u.includes('morning')) return ['morning'];
  return ['morning', 'evening'];
}

const RETINOID = /retina|retinol|retinal/i;
const VITAMIN_C = /ascorbic|vitamin c/i;
const EXFOLIANT = /salicylic|glycolic|lactic|aha|bha/i;

/** Warnings that belong to one product wherever it appears. */
function productWarnings(p: RecommendedProduct, when: TimeOfDay): string[] {
  const out: string[] = [];
  const text = `${p.name} ${p.keyIngredient} ${p.actives.join(' ')}`;

  if (RETINOID.test(text)) {
    out.push('Start twice a week and build up — retinoids commonly cause flaking for the first few weeks.');
    out.push('Not suitable during pregnancy or breastfeeding. Check with your doctor.');
    if (when === 'morning') out.push('Better at night: retinoids increase how easily you burn.');
  }
  if (EXFOLIANT.test(text)) {
    out.push('Increases sun sensitivity — daily sunscreen is not optional alongside this.');
  }
  if (VITAMIN_C.test(text) && when === 'evening') {
    out.push('Works best in the morning, where its antioxidant protection has something to do.');
  }
  return out;
}

/**
 * Notes about the routine as a whole.
 *
 * `everything` is the citizen's WHOLE matched shelf, not just this routine's
 * steps, because the interaction worth warning about is between products that
 * end up in different routines. Checking within one routine missed the exact
 * case the vitamin C / retinoid note exists for: vitamin C is a morning product
 * and a retinoid is a night one, so no single routine ever contains both, and
 * the note never fired for anyone who owned both.
 */
function routineNotes(steps: RoutineStep[], when: TimeOfDay, everything: string): string[] {
  const notes: string[] = [];
  const here = steps.map((s) => `${s.name} ${s.keyIngredient}`).join(' ');

  if (when === 'morning' && steps.length > 0 && !steps.some((s) => /sunscreen/i.test(s.category))) {
    // The single most common way a good routine is wasted.
    notes.push('No sunscreen in this routine yet. Every active below works better — and some only work safely — with daily SPF.');
  }
  // Shown on the routine holding the retinoid: that is where the person is
  // standing when the advice is actionable.
  if (RETINOID.test(here) && VITAMIN_C.test(everything)) {
    notes.push('Vitamin C and a retinoid are both here. Use vitamin C in the morning and the retinoid at night rather than layering them.');
  }
  if (steps.filter((s) => s.step === 'Treat').length > 3) {
    notes.push('That is a lot of actives at once. Introduce one at a time, a fortnight apart, so you can tell what is working.');
  }
  return notes;
}

const TITLES: Record<TimeOfDay, string> = {
  morning: 'Morning',
  evening: 'Evening',
  weekly: 'Weekly',
};

/**
 * Build the morning, evening and weekly routines from recommended products.
 *
 * Only products the engine actually matched to this person are used — an
 * unmatched product is a shelf suggestion, not something to tell somebody to put
 * on their face tonight. A routine with no steps is returned as an empty one
 * rather than omitted, so the UI can say "nothing for the evening yet" instead
 * of silently showing two sections where there should be three.
 */
export function buildRoutines(products: RecommendedProduct[]): Routine[] {
  const matched = products.filter((p) => p.matched);
  // The whole shelf as text, for interactions that span two routines.
  const everything = matched.map((p) => `${p.name} ${p.keyIngredient} ${p.actives.join(' ')}`).join(' ');

  return (['morning', 'evening', 'weekly'] as TimeOfDay[]).map((when) => {
    const steps: RoutineStep[] = matched
      .filter((p) => slotsFor(p.usage).includes(when))
      .map((p) => {
        const c = classify(p);
        return {
          order: c.rank,
          step: c.step,
          productId: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          keyIngredient: p.keyIngredient,
          priceInr: p.priceInr,
          instructions: c.instructions,
          frequency: when === 'weekly' ? 'Once a week' : `Every ${when === 'morning' ? 'morning' : 'evening'}`,
          warnings: productWarnings(p, when),
        };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((s, i) => ({ ...s, order: i + 1 }));

    return { timeOfDay: when, title: TITLES[when], steps, notes: routineNotes(steps, when, everything) };
  });
}
