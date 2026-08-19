import type { RecommendedProduct } from './beauty-engine';
import { isRoutineProduct } from './budget-routine';

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

export type TimeOfDay = 'morning' | 'evening' | 'weekly' | 'body';

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
  /** Two hotlinked photographs and the page it is sold on. Any of them may be
   *  empty, and the images may simply fail — the step renders without them. */
  image: string;
  imageAlt: string;
  productUrl: string;
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
  { match: /face scrub/i, step: 'Exfoliate', rank: 15, instructions: 'Once or twice a week on damp skin, in small circles. Not on broken or sunburnt skin.' },
  { match: /toner|tonic/i, step: 'Prep', rank: 20, instructions: 'Sweep over clean skin and let it absorb before the next step.' },
  { match: /face serum|^serum/i, step: 'Treat', rank: 30, instructions: 'Two or three drops on slightly damp skin; press in rather than rub.' },
  /* `/treatment/` USED TO BE HERE UNANCHORED, AND IT IS THE SAME BUG AS `/cream/`
     BELOW, FOUND THE SAME WAY. ORDER is scanned in array order, so once the
     2026-08 catalogue introduced "Hair treatment" (26 products) and "Scalp
     treatment" (9), both matched this face line — thirty lines above their own —
     and came out at rank 40 with "a pea-sized amount over the WHOLE FACE,
     avoiding the eye area" printed under a keratin smoothening treatment.

     Anchored now. It is worth noting the unanchored rule never matched anything
     it was written for either: no sheet this shelf has ever loaded produces a
     display category of exactly "Treatment", so this line was dormant for its
     whole life and then woke up on the wrong products. */
  { match: /^treatment$/i, step: 'Treat', rank: 40, instructions: 'A pea-sized amount over the whole face, avoiding the eye area.' },
  { match: /facial kit/i, step: 'Facial', rank: 44, instructions: 'Follow the steps in the pack, in order, once a week on clean skin.' },
  { match: /face mask/i, step: 'Mask', rank: 45, instructions: 'A thin, even layer on clean skin. Leave for the time on the pack, then rinse.' },
  { match: /eye cream/i, step: 'Eyes', rank: 46, instructions: 'A grain-sized amount, tapped along the orbital bone with your ring finger. Never on the lid.' },
  { match: /face oil/i, step: 'Nourish', rank: 47, instructions: 'Two or three drops pressed in after your serum, before anything that seals.' },
  /* `/cream/` USED TO BE HERE AND IT CAUGHT "Hand cream". classify() matches on
     the display CATEGORY, and of the sixteen the sheet produces, exactly two
     contain the word: Moisturiser and Hand cream. ORDER is scanned in array
     order, so the hand cream matched this line — three lines above its own —
     and came out labelled MOISTURISE at rank 50. On the live body band that
     put "apply hand cream" at step 1, ABOVE the body wash at step 2, told the
     citizen to "seal everything underneath while skin is still slightly damp",
     and printed MOISTURISE twice in one band. `/moisturiser/` alone reaches
     the only category this line is for. */
  { match: /moisturiser/i, step: 'Moisturise', rank: 50, instructions: 'Seal everything underneath while skin is still slightly damp.' },
  { match: /night cream/i, step: 'Moisturise', rank: 52, instructions: 'Last step at night, on clean skin, after anything you are treating with.' },
  { match: /lip care/i, step: 'Lips', rank: 55, instructions: 'After the rest of the routine, and again whenever they feel tight.' },
  { match: /sunscreen/i, step: 'Protect', rank: 90, instructions: 'Two fingers’ length for the face and neck, as the last step. Reapply if you are out for hours.' },

  /* HAIR HAS ITS OWN ORDER AND IT IS NOT THE FACE'S. Colour first because it is
     the thing you do to the hair rather than for it, then oil before the wash,
     then shampoo, conditioner, and whatever is left in. The single /haircare/
     rule these replace gave every hair product one rank, so a conditioner could
     be printed above the shampoo it has to follow. */
  { match: /hair colour|hair color/i, step: 'Colour', rank: 58, instructions: 'On dry, unwashed hair, following the developer ratio on the pack. Patch test 48 hours before.' },
  { match: /hair oil/i, step: 'Pre-wash', rank: 60, instructions: 'Warm a little between your palms and work into the scalp and lengths an hour before you wash.' },
  { match: /scalp treatment/i, step: 'Scalp', rank: 61, instructions: 'Part the hair and apply directly to the scalp, not the lengths. Massage in and leave it — this is not a rinse-out.' },
  /* DRY SHAMPOO BEFORE SHAMPOO, BECAUSE `/shampoo/` MATCHES IT. It reached the
     wash step and was handed "massage into the scalp and RINSE THOROUGHLY",
     which is the one instruction a dry shampoo must never be given. */
  { match: /dry shampoo/i, step: 'Refresh', rank: 59, instructions: 'On dry roots, from a distance, between washes. Leave a minute, then brush it out.' },
  { match: /shampoo/i, step: 'Wash', rank: 62, instructions: 'Massage into the scalp rather than the lengths, and rinse thoroughly.' },
  { match: /conditioner/i, step: 'Condition', rank: 64, instructions: 'Mid-lengths to ends only, never the scalp. Leave a minute, then rinse.' },
  { match: /hair mask/i, step: 'Treat hair', rank: 66, instructions: 'In place of conditioner, on wash day. Leave for five minutes before rinsing.' },
  { match: /hair treatment/i, step: 'Treat hair', rank: 67, instructions: 'A salon-strength treatment — follow the pack’s timing exactly, and do not stack it with another the same week.' },
  { match: /hair serum/i, step: 'Finish', rank: 68, instructions: 'A few drops through damp mid-lengths and ends. Do not go near the roots.' },
  { match: /hair styling/i, step: 'Style', rank: 69, instructions: 'On damp or dry hair as the product directs, working from the ends up so the roots keep their lift.' },

  /* BODY, ON THE SAME LOGIC: what you wash with, what you scrub with, what you
     seal with, and the things you carry around. */
  { match: /body wash/i, step: 'Wash', rank: 70, instructions: 'In the shower, on damp skin; rinse warm rather than hot.' },
  { match: /^soap$/i, step: 'Wash', rank: 71, instructions: 'On damp skin, rinsed warm. Follow with a lotion while the skin is still damp.' },
  { match: /body scrub/i, step: 'Exfoliate', rank: 72, instructions: 'Once or twice a week on damp skin, in small circles. Not on broken or sunburnt skin.' },
  { match: /body mask/i, step: 'Mask', rank: 73, instructions: 'An even layer on clean skin. Leave for the time on the pack, then rinse warm.' },
  { match: /body lotion/i, step: 'Moisturise', rank: 74, instructions: 'Within three minutes of the shower, while the skin is still damp.' },
  { match: /body oil/i, step: 'Nourish', rank: 75, instructions: 'On damp skin straight out of the shower, before or instead of a lotion.' },
  { match: /hand cream/i, step: 'Hands', rank: 76, instructions: 'After washing your hands, and last thing at night.' },
  { match: /foot care/i, step: 'Feet', rank: 77, instructions: 'On clean, dry feet at night. Cover the heels generously and put socks on over it.' },
  { match: /lip balm/i, step: 'Lips', rank: 78, instructions: 'Whenever they feel tight, and a thicker layer before bed.' },
  { match: /hair removal/i, step: 'Remove', rank: 79, instructions: 'Patch test first. On clean, dry skin, in the direction the pack states — never over broken skin or the same area twice.' },
];

/**
 * ── ON THE SHELF, IN A ROUTINE GROUP, AND STILL NOT A STEP ──────────────────
 *
 * `ROUTINE_GROUPS` keeps makeup, fragrance and tools out of routines. These two
 * are inside a routine group and still do not belong in a list of steps:
 *
 *   Hair kit          107 products, and every one is a BUNDLE of steps — a
 *                     shampoo, a conditioner and often a mask sold together.
 *                     Printed as one step it would say "wash, condition and
 *                     treat" on a single line, above or below the individual
 *                     steps it duplicates.
 *   Hair extensions    29 products. Clip-ins are worn, not applied. There is no
 *                     honest instruction, no frequency, and no place in an
 *                     order that runs oil → wash → condition → finish.
 *
 * They stay recommendable and buyable in the Market. Declared here rather than
 * left to fall through classify(), because a fallthrough is silent and reads as
 * an oversight the next time somebody adds a category.
 */
export const SHOP_ONLY_CATEGORIES: ReadonlySet<string> = new Set(['Hair kit', 'Hair extensions']);

/** The ORDER rule a display category resolves to, or null if it has none.
 *  Exported so a spec can assert the shelf has no category ORDER cannot place. */
export function ruleFor(category: string) {
  return ORDER.find((o) => o.match.test(category)) ?? null;
}

/**
 * A SCALP TREATMENT IS NOT A FINISHING SERUM, AND THE SHEET CANNOT TELL THEM
 * APART. Both arrive as "Hair Serum/Leave-in", so both were classified 'Finish'
 * and both were told "a few drops through damp mid-lengths and ends. DO NOT GO
 * NEAR THE ROOTS." For Ustraa's Hair Growth Vitalizer and Pilgrim's Redensyl +
 * AnaGain serum that is precisely backwards — the roots are the entire point,
 * and the instruction was live on the routine page telling somebody to avoid
 * the only place the product works.
 *
 * Detected from the ACTIVES and the name, which are naming facts: Redensyl and
 * AnaGain are scalp actives and "hair growth vitalizer" is what the bottle
 * calls itself. Nothing here reads the blurb, and nothing here claims the
 * product works — only where it goes.
 */
const SCALP_TREATMENT = /redensyl|anagain|procapil|capixyl|minoxidil|hair growth|hair fall|scalp (serum|tonic|treatment)|vitalizer|vitaliser/i;

function classify(p: RecommendedProduct) {
  if (/^Hair serum$/i.test(p.category) && SCALP_TREATMENT.test(`${p.name} ${p.keyIngredient} ${p.actives.join(' ')}`)) {
    return {
      step: 'Scalp', rank: 61,
      instructions: 'Part the hair and apply directly to the scalp, not the lengths. Massage in and leave it — this is not a rinse-out.',
    };
  }
  return ruleFor(p.category) ?? { step: 'Treat', rank: 45, instructions: 'Apply a thin, even layer.' };
}

/** Which routines a product belongs in, read from its own usage string. */
function slotsFor(usage: string): TimeOfDay[] {
  const u = usage.toLowerCase();
  // Body care is its own band. It is not a fourth step in a considered face
  // routine — nothing in the skin & hair assessment has an opinion about your
  // elbows — but it is on the shelf, so it is listed where it can be followed.
  if (u.includes('body')) return ['body'];
  if (u.includes('weekly')) return ['weekly'];
  if (u.includes('morning') && u.includes('night')) return ['morning', 'evening'];
  if (u.includes('night')) return ['evening'];
  if (u.includes('morning')) return ['morning'];
  return ['morning', 'evening'];
}

/** What each band's steps say about how often. */
const FREQUENCY: Record<TimeOfDay, string> = {
  morning: 'Every morning', evening: 'Every evening',
  weekly: 'On wash day', body: 'Daily, or as needed',
};

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
  // Not just masks: shampoo, conditioner and a pre-wash oil are here too, and
  // "Weekly" alone made a wash day read as an optional extra.
  weekly: 'Weekly & wash day',
  body: 'Body & hands',
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
  /**
   * MATCHED IS NOT ENOUGH ANY MORE. `classify()` reads the display category and
   * falls through to 'Treat' at rank 45 for anything it does not recognise —
   * which was fine while every product on the shelf was a routine step, and is
   * not fine now that the shelf carries lipstick, perfume and hair dryers. A
   * matched foundation would have been printed into the evening skincare
   * routine as a Treat step, with "apply a thin, even layer" under it.
   *
   * Those products stay on the shelf and stay recommendable in the Market. They
   * are simply not steps, so they are not put in a list of steps.
   */
  const matched = products.filter((p) => p.matched && isRoutineProduct(p.group)
    && !SHOP_ONLY_CATEGORIES.has(p.category));
  // The whole shelf as text, for interactions that span two routines.
  const everything = matched.map((p) => `${p.name} ${p.keyIngredient} ${p.actives.join(' ')}`).join(' ');

  return (['morning', 'evening', 'weekly', 'body'] as TimeOfDay[]).map((when) => {
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
          image: p.image,
          imageAlt: p.imageAlt,
          productUrl: p.productUrl,
          instructions: c.instructions,
          frequency: FREQUENCY[when],
          warnings: productWarnings(p, when),
        };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((s, i) => ({ ...s, order: i + 1 }));

    return { timeOfDay: when, title: TITLES[when], steps, notes: routineNotes(steps, when, everything) };
  });
}
