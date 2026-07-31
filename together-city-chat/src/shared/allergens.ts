/**
 * What a declared allergy actually excludes (BE-8.4).
 *
 * There were two answers in the codebase and one of them was "does the word
 * appear anywhere in the text".
 *
 * meal-composer.ts expands a declared term into a family — "milk" reaches
 * paneer, curd and ghee — and the composed plan has been safe because of it.
 * nutrition.service.ts's allergySafe(), which screens the WEEKLY planner and
 * therefore the household's family plan, did a plain substring test on the term
 * as typed. "milk" does not appear in "paneer". A citizen who declared a milk
 * allergy, or a child in a household whose allergies BE-12.1 merges into the
 * family plan, could be served paneer butter masala.
 *
 * The simulations reported "Allergen leaks: 0" throughout. They compute the
 * leak with the same substring test the filter enforces, so the measurement and
 * the mechanism are one function and the zero was guaranteed. RELEASE-GATE.md
 * lists that zero as a hard, non-negotiable safety gate. It was a tautology.
 *
 * This module is the single answer, and it is pure so it can be argued with.
 *
 * IT LIVES IN shared/ AND NOT IN nutrition/ BECAUSE A NUT ALLERGY IS NOT A
 * NUTRITION FACT. It is a fact about the citizen, and it is equally true of a
 * face serum: almond oil is a tree nut whether it is eaten or applied. While
 * this file sat inside the nutrition folder it was imported by exactly two
 * files, both of them nutrition's, and the Beauty hub — which recommends
 * ingredients to put on somebody's skin — wrote its own substring test three
 * times over rather than reach across a hub boundary for it. §3's rule is that
 * a field is owned by exactly one place; so is a vocabulary.
 *
 * MATCHING IS ON WORDS, NOT SUBSTRINGS, which fixes the failures in both
 * directions. "egg" stops matching eggplant. "nut" stops matching coconut,
 * nutmeg and butternut squash — a nut-allergic citizen was being refused every
 * coconut dish in an Indian-first recipe corpus, which is not a safety win, it
 * is the filter becoming useless enough to be switched off.
 *
 * WHERE THE LISTS ARE UNCERTAIN THEY LEAN TOWARDS EXCLUDING. Coconut stays on
 * the tree-nut list because the FDA classifies it as one, even though most
 * people with tree-nut allergies tolerate it. An unnecessary exclusion costs
 * somebody a curry. The other mistake costs them an ambulance.
 */

export type AllergenKey =
  | 'peanut' | 'treenut' | 'milk' | 'egg' | 'gluten'
  | 'soy' | 'fish' | 'shellfish' | 'sesame' | 'mustard';

interface Rule {
  /** Words that mean this allergen is present. Matched on word boundaries. */
  members: readonly string[];
  /** Words that look like a member and are not. Checked first. */
  except?: readonly string[];
}

/**
 * Indian names are first-class here, not an afterthought. A corpus that is
 * Indian-first and an allergen list that only knows English names is a list
 * that misses most of what it is looking at: moongphali, atta, dahi, til.
 */
const RULES: Record<AllergenKey, Rule> = {
  peanut: {
    members: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'moongphali', 'mungfali', 'monkey nut'],
  },
  treenut: {
    members: [
      'nut', 'nuts', 'almond', 'almonds', 'badam', 'cashew', 'cashews', 'kaju',
      'walnut', 'walnuts', 'akhrot', 'pistachio', 'pistachios', 'pista',
      'hazelnut', 'pecan', 'macadamia', 'brazil nut', 'pine nut', 'chilgoza',
      'chestnut', 'coconut', 'nariyal', 'khopra', 'marzipan', 'praline', 'nutella', 'candlenut',
    ],
    // Words containing "nut" that are not one. Without these, "nut" swallowed
    // every coconut dish in the corpus and nutmeg besides.
    except: ['nutmeg', 'jaiphal', 'butternut', 'water chestnut', 'singhara', 'nutrition', 'nutritional yeast', 'doughnut', 'donut'],
  },
  milk: {
    members: [
      'milk', 'dairy', 'paneer', 'cheese', 'butter', 'ghee', 'cream', 'malai',
      'curd', 'dahi', 'yogurt', 'yoghurt', 'lassi', 'chaas', 'buttermilk',
      'khoya', 'mawa', 'rabri', 'shrikhand', 'kheer', 'condensed milk', 'casein',
      'whey', 'lactose', 'custard', 'kulfi', 'chena', 'raita', 'cottage cheese',
    ],
    // Plant milks and nut butters are not dairy. Peanut butter is a peanut
    // problem, and coconut milk a tree-nut one; neither belongs to this family.
    except: [
      'coconut milk', 'almond milk', 'soy milk', 'soya milk', 'oat milk', 'rice milk',
      'peanut butter', 'almond butter', 'cashew butter', 'cocoa butter', 'shea butter',
      'butternut', 'buttermilk substitute', 'milk thistle',
    ],
  },
  egg: {
    members: ['egg', 'eggs', 'anda', 'albumen', 'egg white', 'egg yolk', 'mayonnaise', 'mayo', 'meringue'],
    except: ['eggplant', 'eggless', 'egg-free', 'egg free'],
  },
  gluten: {
    members: [
      'wheat', 'atta', 'maida', 'suji', 'sooji', 'semolina', 'rava', 'dalia',
      'barley', 'jau', 'rye', 'triticale', 'spelt', 'farro', 'bulgur', 'couscous',
      'seitan', 'bread', 'roti', 'chapati', 'chapatti', 'phulka', 'paratha',
      'naan', 'kulcha', 'bhatura', 'pasta', 'noodle', 'noodles', 'macaroni',
      'vermicelli', 'seviyan', 'biscuit', 'cracker', 'breadcrumb', 'breadcrumbs',
      'wheat flour', 'all purpose flour', 'plain flour',
    ],
    // "flour" alone is NOT a member. Besan, rice and almond flour are staples of
    // a gluten-free Indian kitchen, and a rule that took the word on its own
    // removed most of what a coeliac citizen can actually eat.
    except: [
      'rice flour', 'besan', 'gram flour', 'chickpea flour', 'corn flour', 'cornflour',
      'almond flour', 'coconut flour', 'jowar', 'bajra', 'ragi', 'buckwheat', 'kuttu',
      'singhara flour', 'rajgira', 'amaranth flour', 'gluten free', 'gluten-free',
      'rice noodle', 'rice noodles', 'rice vermicelli', 'glutinous rice',
    ],
  },
  soy: {
    // One-word compounds are spelled out because the word matcher will not find
    // "soy" inside "soymilk", and the dataset has seven of those.
    members: ['soy', 'soya', 'soybean', 'soyabean', 'soymilk', 'soyamilk', 'tofu', 'edamame', 'tempeh', 'miso', 'soy sauce', 'tamari', 'textured vegetable protein', 'tvp'],
  },
  fish: {
    members: [
      'fish', 'machli', 'anchovy', 'anchovies', 'sardine', 'sardines', 'tuna',
      'salmon', 'mackerel', 'bangda', 'pomfret', 'rohu', 'katla', 'hilsa',
      'surmai', 'bombil', 'bombay duck', 'cod', 'tilapia', 'basa', 'fish sauce',
      'worcestershire',
    ],
    except: ['fishless', 'shellfish'],   // shellfish is its own family below
  },
  shellfish: {
    members: [
      'shellfish', 'prawn', 'prawns', 'shrimp', 'jhinga', 'crab', 'kekda',
      'lobster', 'crayfish', 'squid', 'calamari', 'octopus', 'oyster', 'oysters',
      'mussel', 'mussels', 'clam', 'clams', 'scallop', 'scallops', 'krill',
    ],
  },
  sesame: {
    members: ['sesame', 'til', 'gingelly', 'tahini', 'benne', 'sesame oil', 'chikki'],
    except: ['tilapia', 'tilak', 'until', 'lentil', 'utility'],   // "til" is three letters and lives inside many words
  },
  mustard: {
    members: ['mustard', 'sarson', 'rai', 'kasundi', 'mustard oil', 'mustard seed'],
    except: ['raisin', 'raisins', 'rice', 'rajma'],
  },
};

/**
 * What a citizen might type, mapped to the families it means. Plural.
 *
 * "nuts" carries peanut as well as treenut, and that is a decision worth
 * stating. A peanut is a legume and a clinician would not call it a tree nut —
 * but nobody types "nuts" into an allergy box meaning "all of them except the
 * one in satay". The first version of this file honoured the botany, and the
 * dataset comparison caught it: 132 recipes containing peanuts became servable
 * to somebody who had written "nuts". The old substring code got this right by
 * accident, because "peanuts" contains "nut".
 *
 * "seafood" carries shellfish for the same reason.
 */
const TERM_TO_KEYS: Record<string, readonly AllergenKey[]> = {
  peanut: ['peanut'], groundnut: ['peanut'], moongphali: ['peanut'], mungfali: ['peanut'],
  nut: ['treenut', 'peanut'], treenut: ['treenut'], 'tree nut': ['treenut'],
  almond: ['treenut'], cashew: ['treenut'], walnut: ['treenut'], pistachio: ['treenut'],
  milk: ['milk'], dairy: ['milk'], lactose: ['milk'], 'milk product': ['milk'], paneer: ['milk'], cheese: ['milk'],
  egg: ['egg'], anda: ['egg'],
  gluten: ['gluten'], wheat: ['gluten'], celiac: ['gluten'], coeliac: ['gluten'], 'gluten intolerance': ['gluten'],
  soy: ['soy'], soya: ['soy'], soybean: ['soy'], tofu: ['soy'],
  fish: ['fish'], seafood: ['fish', 'shellfish'],
  shellfish: ['shellfish'], prawn: ['shellfish'], shrimp: ['shellfish'], crustacean: ['shellfish'],
  sesame: ['sesame'], til: ['sesame'], tahini: ['sesame'],
  mustard: ['mustard'], sarson: ['mustard'],
};

/**
 * Exported because topical-sensitivities.ts is a second vocabulary over the
 * same mechanism, and a second COPY of this line is how the two drift apart.
 */
export const clean = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Whole-word containment, tolerant of a plural: "onion" is in "spring onion",
 * "hazelnut" is in "hazelnuts", and "egg" is not in "eggplant".
 *
 * The plural mattered. Without it the lists had to spell out both forms of
 * every entry, and the first draft missed hazelnuts, oysters and half a dozen
 * others — which is the kind of list that looks complete and is not.
 */
export function hasWord(haystack: string, phrase: string): boolean {
  const p = clean(phrase);
  if (!p) return false;
  return new RegExp(`(^| )${p}e?s?( |$)`).test(haystack);
}

const PREFIX = ['allergic to', 'allergy to', 'intolerant to', 'avoid', 'no'];
const SUFFIX = ['allergy', 'allergies', 'intolerance', 'intolerant', 'sensitivity', 'sensitive', 'free'];

/**
 * The word inside a declaration.
 *
 * A free-text allergies box does not receive tidy vocabulary terms. It receives
 * "nut allergy", "allergic to dairy", "gluten free", "no shellfish" — and every
 * one of those missed the lookup table entirely, falling through to a literal
 * whole-word match against ingredient names, which of course found nothing
 * either. The declaration was read as an unknown food called "nut allergy".
 *
 * TERM_TO_KEYS already carried 'gluten intolerance' as its own entry, which is
 * the same problem solved one phrase at a time. Stripping is the general form.
 *
 * This is the DECLARED side only. Ingredient text is never put through it —
 * "sulphate free" on a label means the opposite of "sulphate free" typed by a
 * citizen, and conflating the two would turn a safe product into an excluded one.
 */
export function declaredTerm(term: string): string {
  let t = clean(term);
  for (let i = 0; i < 3 && t; i++) {
    const before = t;
    for (const p of PREFIX) if (t.startsWith(`${p} `)) t = t.slice(p.length + 1);
    for (const s of SUFFIX) if (t.endsWith(` ${s}`)) t = t.slice(0, -(s.length + 1));
    if (t === before) break;
  }
  return t.trim();
}

/**
 * The allergen family a declared term belongs to, or null when it is just a
 * food somebody would rather not eat. Both are honoured; only the first gets
 * the family treatment.
 */
export function allergenFamilies(term: string): readonly AllergenKey[] {
  const t = declaredTerm(term);
  if (!t) return [];
  const singular = t.endsWith('s') ? t.slice(0, -1) : t;
  return TERM_TO_KEYS[t] ?? TERM_TO_KEYS[singular] ?? [];
}

/** The single family a term means, or null. Convenience over allergenFamilies. */
export function normaliseAllergen(term: string): AllergenKey | null {
  return allergenFamilies(term)[0] ?? null;
}

const CACHE = new Map<string, Set<AllergenKey>>();

/** Every allergen family present in this ingredient or dish name. */
export function allergensIn(name: string): Set<AllergenKey> {
  const n = clean(name);
  if (!n) return new Set();
  const hit = CACHE.get(n);
  if (hit) return hit;
  const out = new Set<AllergenKey>();
  for (const [key, rule] of Object.entries(RULES) as Array<[AllergenKey, Rule]>) {
    if (rule.except?.some((e) => hasWord(n, e))) continue;
    if (rule.members.some((m) => hasWord(n, m))) out.add(key);
  }
  CACHE.set(n, out);
  return out;
}

export interface AllergenHit {
  /** The term the citizen declared. */
  term: string;
  /** The family it resolved to, or null for a plain avoided food. */
  allergen: AllergenKey | null;
  /** The ingredient or dish name that carries it — what to tell them. */
  found: string;
}

/**
 * The first reason this dish is not safe for this citizen, or null.
 *
 * Returns WHICH ingredient matched, not just a boolean. A plan that can say
 * "paneer, because you told us about milk" is one somebody can correct when it
 * is wrong; a plan that silently drops a third of the corpus is one they stop
 * believing.
 */
export function findAllergen(
  dishName: string,
  ingredientNames: readonly string[],
  declared: readonly string[],
): AllergenHit | null {
  const terms = declared.map((d) => clean(d)).filter(Boolean);
  if (!terms.length) return null;

  const candidates = [dishName, ...ingredientNames];
  for (const term of terms) {
    const keys = allergenFamilies(term);
    for (const raw of candidates) {
      const name = clean(raw);
      if (!name) continue;
      if (keys.length) {
        const present = allergensIn(name);
        const hit = keys.find((k) => present.has(k));
        if (hit) return { term, allergen: hit, found: raw };
      } else if (hasWord(name, declaredTerm(term))) {
        // Not a known allergen — an avoided food. Honoured literally, on words.
        return { term, allergen: null, found: raw };
      }
    }
  }
  return null;
}

/** The boolean the planners want. */
export function isAllergenSafe(
  dishName: string,
  ingredientNames: readonly string[],
  declared: readonly string[],
): boolean {
  return findAllergen(dishName, ingredientNames, declared) === null;
}
