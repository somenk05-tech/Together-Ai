import { allergenFamilies, allergensIn, clean, declaredTerm, hasWord, type AllergenKey } from './allergens';

/**
 * What a declared sensitivity excludes from something you put ON somebody.
 *
 * Beauty had three of these and every one of them was `haystack.includes(term)`:
 * beauty-engine's product filter, beauty-analysis's avoid(), and look-decode's
 * shelf filter. Two of the three sat under comments asserting the property they
 * did not have — "hard filter: never surface something the user is
 * allergic/sensitive to", and "anything containing a declared allergen is
 * excluded before matching".
 *
 * A substring test only excludes what the citizen spelled exactly. "Tree nuts"
 * is not a substring of "almond oil". "Salicylates" is not a substring of
 * "salicylic acid" — and salicylic acid is recommended BY NAME to anybody with
 * oily or acne-prone skin, so that miss had a live path to a real person.
 * allergens.ts had already made this exact argument for food and been believed;
 * the same argument had simply never been made two folders across.
 *
 * TWO VOCABULARIES, ONE MECHANISM. Food allergens come from allergens.ts
 * unchanged, because almond oil in a serum is a tree nut and dairy protein in a
 * conditioner is dairy. The families below are the cosmetic half, which food has
 * no reason to know about.
 *
 * THESE LISTS ARE NAMING FACTS, NOT CLINICAL ONES. "Methylparaben is a paraben"
 * and "SLS is a sulphate" are statements about what an ingredient is called.
 * Nothing here asserts who reacts to what, how often, or how badly — that would
 * be a clinical claim, and this repo does not write those from memory.
 *
 * WHERE A LIST IS UNCERTAIN IT LEANS TOWARDS EXCLUDING, for the reason
 * allergens.ts gives: an unnecessary exclusion costs somebody a moisturiser.
 * The other mistake costs them their face for a week.
 */
export type SensitivityKey =
  | 'fragrance' | 'paraben' | 'sulphate' | 'salicylate' | 'retinoid'
  | 'dryingAlcohol' | 'lanolin' | 'silicone' | 'formaldehydeReleaser'
  | 'benzoylPeroxide' | 'aha' | 'chemicalSunscreen' | 'propyleneGlycol';

interface Rule {
  members: readonly string[];
  /** Words that look like a member and are not. Checked first. */
  except?: readonly string[];
}

const RULES: Record<SensitivityKey, Rule> = {
  fragrance: {
    // The declarable fragrance allergens are named individually on an INCI list
    // and almost never as "fragrance", which is the whole reason for a family.
    members: [
      'fragrance', 'parfum', 'perfume', 'aroma', 'essential oil', 'essential oils',
      'linalool', 'limonene', 'citronellol', 'geraniol', 'eugenol', 'coumarin',
      'cinnamal', 'citral', 'farnesol', 'benzyl salicylate', 'hexyl cinnamal',
    ],
    // "Fragrance-free" is a claim that the thing is safe for this citizen, and
    // matching it would exclude precisely the products they can use.
    except: ['fragrance free', 'unscented', 'parfum free', 'no added fragrance'],
  },
  paraben: {
    members: ['paraben', 'parabens', 'methylparaben', 'ethylparaben', 'propylparaben', 'butylparaben', 'isobutylparaben'],
    except: ['paraben free'],
  },
  sulphate: {
    members: [
      'sulphate', 'sulfate', 'sls', 'sles', 'sodium lauryl sulfate', 'sodium laureth sulfate',
      'sodium lauryl sulphate', 'sodium laureth sulphate', 'ammonium lauryl sulfate',
    ],
    // Not detergents. Magnesium sulphate is Epsom salt; zinc and barium sulphate
    // are minerals — excluding them would gut the list for no benefit.
    except: ['sulfate free', 'sulphate free', 'magnesium sulfate', 'magnesium sulphate', 'zinc sulfate', 'zinc sulphate', 'barium sulfate', 'ferrous sulfate'],
  },
  salicylate: {
    // 'bha' is deliberately here and deliberately uncomfortable: in skincare it
    // means beta hydroxy acid (salicylic acid), and on a preservative list it
    // means butylated hydroxyanisole. Reading it as the acid over-excludes a
    // rare preservative; reading it as the preservative hands salicylic acid to
    // a salicylate-sensitive citizen. The asymmetry decides it.
    // 'salicylic' bare, not only 'salicylic acid': beauty-analysis calls the
    // filter with short tokens ('salicylic', 'retinol', 'sulphate') and with
    // `name.split(' ')[0]`, so the haystack is routinely one word.
    members: ['salicylate', 'salicylates', 'salicylic', 'salicylic acid', 'bha', 'beta hydroxy acid', 'willow bark', 'salix', 'aspirin', 'acetylsalicylic acid'],
  },
  retinoid: {
    members: ['retinoid', 'retinoids', 'retinol', 'retinal', 'retinaldehyde', 'retinyl', 'retinyl palmitate', 'tretinoin', 'adapalene', 'tazarotene', 'granactive retinoid'],
    // Vitamin A the dietary nutrient is not a topical retinoid, and a food label
    // is not a skincare ingredient list.
    except: ['vitamin a rich', 'beta carotene'],
  },
  dryingAlcohol: {
    members: ['alcohol denat', 'denatured alcohol', 'sd alcohol', 'ethanol', 'isopropyl alcohol', 'isopropanol', 'methanol'],
    // FATTY alcohols are emollients, not solvents. Without this, a declared
    // "alcohol" would exclude most moisturisers on the shelf — the kind of
    // over-exclusion that gets a safety filter switched off entirely.
    except: ['cetyl alcohol', 'stearyl alcohol', 'cetearyl alcohol', 'behenyl alcohol', 'lauryl alcohol', 'myristyl alcohol', 'alcohol free'],
  },
  lanolin: { members: ['lanolin', 'wool wax', 'wool alcohol', 'wool grease'] },
  silicone: { members: ['silicone', 'silicones', 'dimethicone', 'cyclomethicone', 'cyclopentasiloxane', 'siloxane', 'amodimethicone'], except: ['silicone free'] },
  formaldehydeReleaser: {
    members: ['formaldehyde', 'dmdm hydantoin', 'quaternium', 'imidazolidinyl urea', 'diazolidinyl urea', 'bronopol', 'sodium hydroxymethylglycinate'],
  },
  benzoylPeroxide: { members: ['benzoyl peroxide'] },
  aha: {
    members: ['aha', 'ahas', 'alpha hydroxy acid', 'glycolic acid', 'lactic acid', 'mandelic acid', 'tartaric acid', 'malic acid'],
  },
  chemicalSunscreen: {
    members: ['oxybenzone', 'avobenzone', 'octinoxate', 'octocrylene', 'homosalate', 'octisalate', 'benzophenone', 'ethylhexyl methoxycinnamate'],
  },
  propyleneGlycol: { members: ['propylene glycol'] },
};

/**
 * What a citizen actually types, mapped to a family. Beauty's onboarding offers
 * "Fragrance / Retinol / Parabens / Sulphates" as chips, and people add their
 * own; both routes land here.
 */
const TERM_TO_KEYS: Record<string, readonly SensitivityKey[]> = {
  fragrance: ['fragrance'], fragrances: ['fragrance'], perfume: ['fragrance'], parfum: ['fragrance'],
  scent: ['fragrance'], 'essential oil': ['fragrance'], 'essential oils': ['fragrance'],
  paraben: ['paraben'], parabens: ['paraben'],
  sulphate: ['sulphate'], sulphates: ['sulphate'], sulfate: ['sulphate'], sulfates: ['sulphate'], sls: ['sulphate'],
  salicylate: ['salicylate'], salicylates: ['salicylate'], 'salicylic acid': ['salicylate'], aspirin: ['salicylate'], bha: ['salicylate'],
  retinoid: ['retinoid'], retinoids: ['retinoid'], retinol: ['retinoid'], tretinoin: ['retinoid'], 'vitamin a': ['retinoid'],
  alcohol: ['dryingAlcohol'], 'drying alcohol': ['dryingAlcohol'], 'alcohol denat': ['dryingAlcohol'], ethanol: ['dryingAlcohol'],
  lanolin: ['lanolin'], wool: ['lanolin'],
  silicone: ['silicone'], silicones: ['silicone'], dimethicone: ['silicone'],
  formaldehyde: ['formaldehydeReleaser'],
  'benzoyl peroxide': ['benzoylPeroxide'],
  aha: ['aha'], ahas: ['aha'], 'glycolic acid': ['aha'], 'alpha hydroxy acid': ['aha'],
  'chemical sunscreen': ['chemicalSunscreen'], oxybenzone: ['chemicalSunscreen'], benzophenone: ['chemicalSunscreen'],
  'propylene glycol': ['propyleneGlycol'],
};

const CACHE = new Map<string, Set<SensitivityKey>>();

/** Every cosmetic sensitivity family named in this product or ingredient. */
export function sensitivitiesIn(name: string): Set<SensitivityKey> {
  const n = clean(name);
  if (!n) return new Set();
  const hit = CACHE.get(n);
  if (hit) return hit;
  const out = new Set<SensitivityKey>();
  for (const [key, rule] of Object.entries(RULES) as Array<[SensitivityKey, Rule]>) {
    if (rule.except?.some((e) => hasWord(n, e))) continue;
    if (rule.members.some((m) => hasWord(n, m))) out.add(key);
  }
  CACHE.set(n, out);
  return out;
}

/** The families a declared term means — cosmetic first, then food. */
export function sensitivityFamilies(term: string): readonly SensitivityKey[] {
  // declaredTerm, not clean: "fragrance sensitivity" and "allergic to parabens"
  // are what a free-text box actually receives.
  const t = declaredTerm(term);
  if (!t) return [];
  const singular = t.endsWith('s') ? t.slice(0, -1) : t;
  return TERM_TO_KEYS[t] ?? TERM_TO_KEYS[singular] ?? [];
}

export interface SensitivityHit {
  /** The term the citizen declared. */
  term: string;
  /** The family it resolved to, or null for a literal avoided ingredient. */
  family: SensitivityKey | AllergenKey | null;
  /** The product or ingredient carrying it — what to tell them. */
  found: string;
}

/**
 * The first reason this product is not for this citizen, or null.
 *
 * Returns WHICH ingredient matched for the same reason findAllergen does: a
 * shelf that can say "we left out the Almond Glow Serum, because you told
 * Nutrition about nuts" is one somebody can correct when it is wrong.
 *
 * Order of resolution per declared term: cosmetic family, then food allergen
 * family, then a literal whole-word match. The last case is what honours a
 * citizen who wrote something none of our lists know — "rosemary", a brand, an
 * ingredient we have never heard of. It is matched on words, not substrings, so
 * it stays a filter and does not become a lottery.
 */
export function findSensitivity(
  productName: string,
  ingredientNames: readonly string[],
  declared: readonly string[],
): SensitivityHit | null {
  const terms = declared.map((d) => clean(d)).filter(Boolean);
  if (!terms.length) return null;

  const candidates = [productName, ...ingredientNames].filter(Boolean);
  for (const term of terms) {
    const cosmetic = sensitivityFamilies(term);
    const food = allergenFamilies(term);
    for (const raw of candidates) {
      const name = clean(raw);
      if (!name) continue;
      if (cosmetic.length) {
        const present = sensitivitiesIn(name);
        const hit = cosmetic.find((k) => present.has(k));
        if (hit) return { term, family: hit, found: raw };
      }
      if (food.length) {
        const present = allergensIn(name);
        const hit = food.find((k) => present.has(k));
        if (hit) return { term, family: hit, found: raw };
      }
      if (!cosmetic.length && !food.length && hasWord(name, declaredTerm(term))) {
        return { term, family: null, found: raw };
      }
    }
  }
  return null;
}

/** The boolean the three Beauty call sites want. */
export function isTopicallySafe(
  productName: string,
  ingredientNames: readonly string[],
  declared: readonly string[],
): boolean {
  return findSensitivity(productName, ingredientNames, declared) === null;
}
