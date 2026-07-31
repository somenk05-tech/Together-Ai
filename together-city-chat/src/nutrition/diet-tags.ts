/**
 * What is actually in a dish, and who may therefore eat it (BE-8.2).
 *
 * THE PROBLEM THIS REPLACES. Diet was decided in several places that did not
 * agree with each other:
 *
 *   - `dietAllows()` trusts the recipe's own `diet` column and never looks at
 *     what is in the dish. The recipe library filters on that column alone.
 *   - `composeFor()` carries a hardcoded `jainExcludes` array and applies it as
 *     an ingredient exclusion — so the meal planner is safe and the library
 *     browsing the same rows is not.
 *   - `recipeVariants()` carries its own `jainRe` regex.
 *   - `plate.ts` has a boolean `jain` that only swaps the salad.
 *
 * Four answers to one question. The spec's wording for BE-8.2 is "enforced in
 * the query layer so no code path can bypass it", and the reason is in the data:
 * this repository ships recipes TAGGED `jain` that contain potato and carrot.
 * A Jain user browsing the library is shown them, labelled Jain, because the
 * only thing consulted is the label.
 *
 * So the tag is no longer trusted on its own. A dish is screened against what it
 * contains, and the label is checked against the same screen.
 *
 * MATCHING IS BY EXCLUSION, with exceptions, which is how every allergen filter
 * works: an ingredient is allowed unless it matches something forbidden. That
 * has a known failure mode — an unlisted name slips through — so the aliases
 * below are deliberately thorough, including the Hindi and regional names these
 * recipes actually use, and `diet-integrity.spec.ts` walks the seeded corpus so
 * a row that contradicts its own tag fails the build rather than reaching a
 * plate.
 *
 * The exceptions matter as much as the matches. "Coconut milk" is not dairy,
 * "peanut butter" is not butter, "kidney beans" are not an organ, and an
 * "eggplant" is not an egg. A filter that gets those wrong stops being used.
 *
 * WHAT WAS A JUDGEMENT CALL, AND WHO MADE IT. Jain practice varies between
 * households, so the boundary cases are a decision rather than a derivation.
 * Fresh ginger and mushroom are excluded (both already appear in the two
 * hardcoded lists this module replaces). Sabudana was NOT, on the grounds that
 * it is widely eaten — which left the list excluding cassava while admitting
 * sabudana, sago and tapioca, all of which are the same cassava root in
 * processed form. The product owner has now ruled: exclude it, because a
 * religious filter earns its trust by being consistent, and one arbitrary
 * exception invites doubt about every other entry.
 *
 * That decision costs something real and it is worth naming: sabudana khichdi
 * is standard Jain fasting food in many households, and this filter will now
 * keep it off a Jain plate. Someone who wants it is better served by a filter
 * they can predict than by one that happens to agree with them here and not
 * about carrots.
 *
 * What was NEVER a judgement call: potato and carrot are on the app's own list,
 * and shipping them inside a dish labelled Jain is a bug.
 */

/** The seven tags the spec names, on the dish rather than on the eater. */
export type DietTag =
  | 'contains-meat'
  | 'contains-fish'
  | 'contains-egg'
  | 'contains-onion-garlic'
  | 'contains-root-vegetable'
  | 'contains-dairy'
  | 'contains-honey';

/** The diets a citizen can hold. `jainvegan` is an internal recipe tag. */
export type DietKey =
  | 'everything' | 'nonveg' | 'pesc' | 'egg'
  | 'veg' | 'vegetarian' | 'vegan' | 'jain' | 'jainvegan';

/**
 * What each diet forbids.
 *
 * Jain is vegetarian PLUS the root rule — it is not "stricter vegan", which is
 * the mistake the old level table made by ranking `jain` and `vegan` both at 0.
 * They are not on one axis: a vegan dish may be full of onion, garlic and
 * potato, and a Jain dish may be full of ghee and paneer. Ranking them together
 * served onions to Jains and dairy to vegans in the same line of code.
 */
export const FORBIDDEN_BY_DIET: Record<DietKey, DietTag[]> = {
  everything: [],
  nonveg: [],
  pesc: ['contains-meat'],
  egg: ['contains-meat', 'contains-fish'],
  veg: ['contains-meat', 'contains-fish', 'contains-egg'],
  vegetarian: ['contains-meat', 'contains-fish', 'contains-egg'],
  vegan: ['contains-meat', 'contains-fish', 'contains-egg', 'contains-dairy', 'contains-honey'],
  jain: ['contains-meat', 'contains-fish', 'contains-egg', 'contains-onion-garlic', 'contains-root-vegetable'],
  jainvegan: [
    'contains-meat', 'contains-fish', 'contains-egg', 'contains-dairy', 'contains-honey',
    'contains-onion-garlic', 'contains-root-vegetable',
  ],
};

interface TagRule { tag: DietTag; match: RegExp; except?: RegExp }

/**
 * Word-boundary matching throughout, so "chicken" does not fire on "chickpea"
 * and "egg" does not fire on "eggplant". Where a boundary is not enough, an
 * `except` pattern is checked first.
 */
const RULES: TagRule[] = [
  {
    tag: 'contains-meat',
    match: /\b(meat|chicken|murgh|mutton|lamb|goat|mated|beef|steak|pork|bacon|ham|sausage|salami|pepperoni|chorizo|keema|kheema|mince|turkey|duck|veal|venison|brisket|lard|tallow|gelatin|gelatine)\b/i,
    // "chicken-free", "mock duck" and stock cubes labelled vegetarian are not meat.
    except: /\b(chicken|meat|beef|duck)[- ]free\b|\bmock \w+|\bvegan \w+|\bplant[- ]based \w+|\bsoya? (chunk|granule|mince)/i,
  },
  {
    tag: 'contains-fish',
    match: /\b(fish|prawn|prawns|shrimp|crab|lobster|squid|calamari|salmon|tuna|mackerel|sardine|sardines|anchovy|anchovies|pomfret|rohu|hilsa|surmai|bombil|oyster|mussel|mussels|clam|clams|scallop|scallops|seafood|caviar|roe|bonito|katsuobushi|worcestershire)\b/i,
    except: /\bfish[- ]free\b|\bvegan fish\b/i,
  },
  {
    tag: 'contains-egg',
    // "anda" is the Hindi. Mayonnaise is egg unless it says otherwise.
    match: /\b(egg|eggs|anda|ande|albumen|meringue|mayonnaise|mayo)\b/i,
    except: /\begg[- ]?(plant|less|free)\b|\bvegan mayo(nnaise)?\b|\beggless\b/i,
  },
  {
    tag: 'contains-onion-garlic',
    // Asafoetida (hing) is deliberately absent: it is what Jain cooking uses
    // INSTEAD of onion and garlic, and excluding it would empty the cuisine.
    match: /\b(onion|onions|shallot|shallots|scallion|scallions|spring onion|leek|leeks|chive|chives|garlic|pyaz|pyaaz|kanda|lehsun|lasun|lasan|allium)\b/i,
    except: /\b(onion|garlic)[- ]free\b|\bno onion\b/i,
  },
  {
    tag: 'contains-root-vegetable',
    match: /\b(potato|potatoes|aloo|alu|batata|sweet potato|shakarkand|shakarkandi|yam|suran|jimikand|arbi|arvi|colocasia|taro|carrot|carrots|gajar|radish|mooli|muli|daikon|beetroot|beet|beets|chukandar|turnip|shalgam|rutabaga|parsnip|celeriac|cassava|sabudana|sabudhana|sago|javvarisi|saggubiyyam|tapioca|mushroom|mushrooms|ginger|adrak|horseradish|jerusalem artichoke)\b/i,
    // Powdered/dried spices from rhizomes are not the root vegetable, and
    // "ginger garlic paste" is caught by the onion-garlic rule regardless.
    // "<thing>-free" covers the Jain variants this corpus actually ships —
    // "Carrot Peas-Free Pulao" and friends name what they leave OUT.
    except: /\b(ginger|turmeric) (powder|dried)\b|\bdry ginger\b|\bsonth\b|\b(potato|carrot|radish|beetroot|mushroom|ginger|onion|garlic|root)[- ]free\b/i,
  },
  {
    tag: 'contains-dairy',
    match: /\b(milk|doodh|curd|dahi|yogurt|yoghurt|paneer|cheese|butter|makhan|ghee|cream|malai|khoya|mawa|buttermilk|chaas|chhas|lassi|whey|casein|ricotta|mozzarella|parmesan|custard)\b/i,
    // Plant milks and nut butters are the whole reason this needs an exception.
    except: /\b(coconut|almond|soy|soya|oat|rice|cashew|hemp|peanut|groundnut|nut|seed|shea|cocoa|apple|vegan) (milk|butter|cream|cheese|yogurt|yoghurt|curd)\b|\bnon[- ]dairy\b|\bdairy[- ]free\b|\bplant[- ]based (milk|cream|butter)\b/i,
  },
  {
    tag: 'contains-honey',
    match: /\b(honey|shahad|madhu)\b/i,
    except: /\bhoney[- ]?(dew|comb free)\b|\bvegan honey\b/i,
  },
];

/**
 * Memoised by name, because this runs in the meal composer's inner loop.
 *
 * `passes()` screens every candidate dish on every pick, and the shipped corpus
 * has 118,232 ingredient rows drawn from only 4,776 distinct names — so without
 * a cache the same fourteen regexes run against "onion" tens of thousands of
 * times per plan. The function is pure, so caching it is free of consequence
 * beyond memory, and the key space is bounded by the corpus.
 */
const TAG_CACHE = new Map<string, DietTag[]>();

/** Everything this ingredient name says about itself. */
export function tagsForIngredient(name: string): DietTag[] {
  const n = (name ?? '').toLowerCase().trim();
  if (!n) return [];
  const hit = TAG_CACHE.get(n);
  if (hit) return hit;
  const out: DietTag[] = [];
  for (const r of RULES) {
    if (r.except?.test(n)) continue;
    if (r.match.test(n)) out.push(r.tag);
  }
  TAG_CACHE.set(n, out);
  return out;
}

/** The union across a dish's ingredient list. */
export function tagsForRecipe(ingredientNames: readonly string[]): DietTag[] {
  const set = new Set<DietTag>();
  for (const name of ingredientNames) for (const t of tagsForIngredient(name)) set.add(t);
  return [...set];
}

export interface DietScreen {
  ok: boolean;
  /** Which ingredient broke which rule — named, so the reason can be shown. */
  offending: { ingredient: string; tag: DietTag }[];
}

/**
 * May this citizen eat this dish?
 *
 * Answered from the INGREDIENTS, not from the dish's label. The label is a
 * claim; the ingredients are the dish.
 */
export function screenRecipe(diet: string, ingredientNames: readonly string[]): DietScreen {
  const forbidden = FORBIDDEN_BY_DIET[normaliseDiet(diet)];
  if (!forbidden.length) return { ok: true, offending: [] };

  const offending: { ingredient: string; tag: DietTag }[] = [];
  for (const ingredient of ingredientNames) {
    for (const tag of tagsForIngredient(ingredient)) {
      if (forbidden.includes(tag)) offending.push({ ingredient, tag });
    }
  }
  return { ok: offending.length === 0, offending };
}

/**
 * Does a recipe's own diet label match what is in it?
 *
 * The check that catches a corpus row lying about itself — a dish tagged `jain`
 * with potato in it. Run over the seed pool by diet-integrity.spec.ts.
 */
export function labelMatchesContents(recipeDiet: string, ingredientNames: readonly string[]): DietScreen {
  return screenRecipe(recipeDiet, ingredientNames);
}

/** Unknown or empty diet strings read as vegetarian: the safe middle, and the
 *  existing behaviour of every ladder this replaces. */
export function normaliseDiet(diet: string | null | undefined): DietKey {
  const d = (diet ?? '').toLowerCase().trim();
  if (d in FORBIDDEN_BY_DIET) return d as DietKey;
  if (d === 'non-veg' || d === 'nonvegetarian') return 'nonveg';
  if (d === 'eggetarian') return 'egg';
  if (d === 'pescatarian') return 'pesc';
  return 'vegetarian';
}

/** Plain-English reason, for a UI that has to say why a dish is not shown. */
export function explainScreen(screen: DietScreen): string {
  if (screen.ok) return '';
  const first = screen.offending[0];
  const what: Record<DietTag, string> = {
    'contains-meat': 'meat',
    'contains-fish': 'fish or shellfish',
    'contains-egg': 'egg',
    'contains-onion-garlic': 'onion or garlic',
    'contains-root-vegetable': 'a root vegetable',
    'contains-dairy': 'dairy',
    'contains-honey': 'honey',
  };
  return `contains ${what[first.tag]} (${first.ingredient})`;
}


/**
 * The Jain exclusions as plain substrings, for the composer's generic
 * ingredient-exclusion mechanism.
 *
 * That mechanism takes a list of strings and drops any dish whose name or
 * ingredients contain one — it predates this module and is shared with
 * allergies and clinical avoid-lists, so it stays. What changes is where the
 * list comes from: it was written out by hand inside composeFor(), and a second
 * hand-written copy lived in recipeVariants(). The RULES above remain the
 * authority; this is the same intent expressed in the form that mechanism eats,
 * kept here so the two cannot drift apart again.
 */
export const JAIN_EXCLUSION_HINTS: readonly string[] = [
  'onion', 'garlic', 'pyaz', 'lehsun', 'shallot', 'leek', 'chive',
  'potato', 'aloo', 'batata', 'yam', 'suran', 'arbi', 'colocasia', 'taro',
  'carrot', 'gajar', 'radish', 'mooli', 'beetroot', 'turnip', 'cassava',
  // Sabudana, sago and tapioca are cassava in processed form. Cassava was
  // already here; these three were the inconsistency.
  'sabudana', 'sago', 'tapioca',
  'mushroom', 'ginger', 'adrak',
];
