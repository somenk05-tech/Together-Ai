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
  { match: /toner|tonic/i, step: 'Prep', rank: 20, instructions: 'Sweep over clean skin and let it absorb before the next step.' },
  { match: /face serum|^serum/i, step: 'Treat', rank: 30, instructions: 'Two or three drops on slightly damp skin; press in rather than rub.' },
  { match: /treatment/i, step: 'Treat', rank: 40, instructions: 'A pea-sized amount over the whole face, avoiding the eye area.' },
  { match: /face mask/i, step: 'Mask', rank: 45, instructions: 'A thin, even layer on clean skin. Leave for the time on the pack, then rinse.' },
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
  { match: /sunscreen/i, step: 'Protect', rank: 90, instructions: 'Two fingers’ length for the face and neck, as the last step. Reapply if you are out for hours.' },

  /* HAIR HAS ITS OWN ORDER AND IT IS NOT THE FACE'S. Oil before the wash, then
     shampoo, then conditioner, then whatever is left in. The single /haircare/
     rule these replace gave every hair product one rank, so a conditioner could
     be printed above the shampoo it has to follow. */
  { match: /hair oil/i, step: 'Pre-wash', rank: 60, instructions: 'Warm a little between your palms and work into the scalp and lengths an hour before you wash.' },
  { match: /shampoo/i, step: 'Wash', rank: 62, instructions: 'Massage into the scalp rather than the lengths, and rinse thoroughly.' },
  { match: /conditioner/i, step: 'Condition', rank: 64, instructions: 'Mid-lengths to ends only, never the scalp. Leave a minute, then rinse.' },
  { match: /hair mask/i, step: 'Treat hair', rank: 66, instructions: 'In place of conditioner, on wash day. Leave for five minutes before rinsing.' },
  { match: /hair serum/i, step: 'Finish', rank: 68, instructions: 'A few drops through damp mid-lengths and ends. Do not go near the roots.' },

  /* BODY, ON THE SAME LOGIC: what you wash with, what you scrub with, what you
     seal with, and the two things you carry around. */
  { match: /body wash/i, step: 'Wash', rank: 70, instructions: 'In the shower, on damp skin; rinse warm rather than hot.' },
  { match: /body scrub/i, step: 'Exfoliate', rank: 72, instructions: 'Once or twice a week on damp skin, in small circles. Not on broken or sunburnt skin.' },
  { match: /body lotion/i, step: 'Moisturise', rank: 74, instructions: 'Within three minutes of the shower, while the skin is still damp.' },
  { match: /hand cream/i, step: 'Hands', rank: 76, instructions: 'After washing your hands, and last thing at night.' },
  { match: /lip balm/i, step: 'Lips', rank: 78, instructions: 'Whenever they feel tight, and a thicker layer before bed.' },
];

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
  return ORDER.find((o) => o.match.test(p.category)) ?? { step: 'Treat', rank: 45, instructions: 'Apply a thin, even layer.' };
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
  const matched = products.filter((p) => p.matched);
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
