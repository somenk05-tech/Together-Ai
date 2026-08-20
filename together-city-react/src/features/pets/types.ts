/**
 * ── THE PET DISTRICT'S VOCABULARY ───────────────────────────────────────────
 *
 * One file of types for the whole hub, because every other module here is
 * downstream of two nouns — a PET and a PRODUCT — and a second definition of
 * either is how a feeding plan and a shopping list stop agreeing about the
 * animal they are for.
 *
 * TWO DECISIONS ARE WRITTEN INTO THESE TYPES RATHER THAN INTO THE PAGES.
 *
 * 1 · `Verified` is not optional. Every commercial number in this hub arrives
 *     from a retailer page that was actually fetched, or it does not arrive.
 *     A price the catalogue could not confirm is `null` and its `verified.price`
 *     is false — never a plausible-looking number. The pages read the flag and
 *     print "Price not verified" rather than inventing a rupee value, which is
 *     the whole reason the flag is on the record instead of in a comment.
 *
 * 2 · `MealKind` separates COMPLETE from COMPLEMENTARY, and nothing in this
 *     hub is allowed to blur them. A commercial complete-and-balanced diet and
 *     a bowl of chicken and rice are both "food" and are not the same claim.
 *     The recipe cards, the planner and the shopping list all carry the
 *     distinction because a home-cooked meal presented as a complete diet is
 *     the single most harmful thing a pet-nutrition product can do.
 */

export type Species = 'dog' | 'cat';
export type SpeciesScope = Species | 'both';
export type Sex = 'male' | 'female';
export type LifeStage = 'puppy' | 'kitten' | 'adult' | 'senior' | 'all';
export type ActivityLevel = 'low' | 'moderate' | 'high';
export type BodyCondition = 'under' | 'ideal' | 'over';
export type Housing = 'indoor' | 'outdoor' | 'both';
export type DietStyle = 'commercial' | 'home-cooked' | 'mixed';
export type Goal =
  | 'maintain'
  | 'weight-loss'
  | 'weight-gain'
  | 'growth'
  | 'senior'
  | 'wellness';

/** SAFE / LIMIT / AVOID — the only three answers the ingredient search gives. */
export type Verdict = 'SAFE' | 'LIMIT' | 'AVOID';

export interface PetPhoto {
  id: string;
  /** A square JPEG data URL today; a media id once the server exists. */
  url: string;
  name: string;
  bytes: number;
  /** name:size:mtime — what makes "already added" answerable. */
  fingerprint: string;
  /** What the scrubber removed, so the UI can be specific about privacy
   *  instead of claiming a thing it did not do to this particular file. */
  removed: string[];
  addedAt: string;
}

/**
 * WHAT A VET WOULD ASK FOR, KEPT WHERE THE OWNER CAN FIND IT.
 *
 * This is a RECORD, not a diagnosis engine. Nothing in this hub infers a
 * condition, scores one, or recommends a treatment for one — it stores what the
 * owner or their vet already knows, so that it is in a pocket at 11pm when the
 * emergency clinic asks what the dog is on. Every field is free text for the
 * same reason: a dropdown of conditions would be this product deciding which
 * illnesses exist.
 */
export interface PetMedical {
  conditions: string;
  medications: string;
  vetName: string;
  vetPhone: string;
  microchipId: string;
  insurer: string;
  policyNumber: string;
  bloodGroup: string;
  notes: string;
}

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string;
  /** ISO date. Age is always DERIVED from this — never stored, never drifts. */
  dob: string | null;
  /** Kept for pets whose owner knows the age but not the birthday. */
  ageMonths: number | null;
  sex: Sex | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  bodyCondition: BodyCondition;
  activity: ActivityLevel;
  housing: Housing;
  sterilised: boolean | null;
  allergies: string[];
  sensitivities: string[];
  restrictions: string[];
  currentFood: string;
  dietStyle: DietStyle;
  goal: Goal;
  healthNotes: string;
  /** See PetMedical — stored, never interpreted. */
  medical: PetMedical;
  /** Up to five photographs, first one is the face the city draws.
   *  See engine/photos.ts — scrubbed of location before they are ever stored. */
  photos: PetPhoto[];
  /** The drawn fallback, used until there is a photograph and whenever one
   *  fails to load. A pet with no photo is not a pet with no portrait. */
  portrait: string;
  createdAt: string;
}

export interface ProductVariant {
  pack: string | null;
  priceInr: number | null;
  mrpInr: number | null;
}

export interface ProductNutrition {
  proteinPct: number | null;
  fatPct: number | null;
  fibrePct: number | null;
  moisturePct: number | null;
  ashPct: number | null;
  kcalPerKg: number | null;
}

export type ProductCategory =
  | 'food'
  | 'vet-diet'
  | 'treats'
  | 'litter'
  | 'walk'
  | 'toys'
  | 'grooming'
  | 'home'
  | 'wellness'
  | 'training'
  | 'cleaning'
  | 'fashion';

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  subcategory: string;
  species: SpeciesScope;
  lifeStage: LifeStage;
  breedSize: string;
  packSizes: string[];
  variants: ProductVariant[];
  priceFrom: number | null;
  mrpFrom: number | null;
  nutrition: ProductNutrition;
  mainProtein: string | null;
  grainFree: boolean | null;
  keyIngredients: string | null;
  specs: string | null;
  retailer: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  /** 'source page' | 'search result' — how the image URL was obtained, kept so
   *  the licensing conversation can be had per-row rather than per-catalogue. */
  imageSource: string | null;
  /** Parasiticides, supplements carrying a health claim, prescription diets. */
  vetGuidance: boolean;
  notes: string;
  group: string;
  verified: { price: boolean; nutrition: boolean; image: boolean };
  lastVerified: string;
}

export interface Ingredient {
  name: string;
  indianName: string | null;
  dog: Verdict;
  cat: Verdict;
  dogReason: string;
  catReason: string;
  preparation: string;
  portion: string;
  frequency: string;
  risks: string[];
  allergen: boolean | null;
  rawCooked: string;
  sources: string[];
}

export interface ToxicFood {
  name: string;
  affects: 'Dog' | 'Cat' | 'Both';
  severity: 'FATAL' | 'SEVERE' | 'MODERATE';
  dose: string | null;
  mechanism: string;
  symptoms: string[];
  onset: string | null;
  whatToDo: string;
  speciesNote: string | null;
  sources: string[];
}

/** Per 100 g edible portion, from IFCT 2017 unless the source says otherwise. */
export interface FoodComposition {
  key: string;
  name: string;
  basis: string;
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  fibreG: number | null;
  calciumMg: number | null;
  phosphorusMg: number | null;
  source: string;
  sourceUrl: string;
  note: string;
}

export type MealKind = 'complete' | 'complementary';

export interface RecipeItem {
  /** Key into the composition table — the calorie maths is not guesswork. */
  food: string;
  label: string;
  /** Share of the meal by cooked weight. Portions scale with the pet. */
  share: number;
}

export interface Recipe {
  id: string;
  name: string;
  species: SpeciesScope;
  kind: MealKind;
  summary: string;
  items: RecipeItem[];
  method: string[];
  suitableFor: string[];
  notFor: string[];
  supplementNote: string;
  prepMinutes: number;
  tags: string[];
}

export interface MealSlot {
  id: string;
  slot: 'breakfast' | 'lunch' | 'dinner';
  time: string;
  title: string;
  detail: string;
  grams: number | null;
  /** When the listing published no kcal/kg — an estimated band, not a guess.
   *  See data/density.ts for where both edges come from. */
  gramsRange: [number, number] | null;
  portionBasis: string;
  kcal: number | null;
  kind: MealKind;
  recipeId: string | null;
  productId: string | null;
  done: boolean;
}

export interface DayPlan {
  date: string;
  meals: MealSlot[];
  treatKcal: number;
  waterMl: [number, number];
}

export interface NutritionPlan {
  petId: string;
  createdAt: string;
  rerKcal: number;
  merKcal: number;
  factor: number;
  factorReason: string;
  mealsPerDay: number;
  treatKcal: number;
  waterMl: [number, number];
  proteinNote: string;
  avoid: string[];
  cautions: string[];
  days: DayPlan[];
}

export interface CartLine {
  productId: string;
  variantIndex: number;
  qty: number;
}

export interface ShoppingItem {
  id: string;
  label: string;
  qty: string;
  source: 'together-city' | 'home-kitchen';
  productId: string | null;
  checked: boolean;
  custom: boolean;
}

export interface ServiceListing {
  id: string;
  name: string;
  kind:
    | 'vet'
    | 'emergency'
    | 'groomer'
    | 'boarding'
    | 'sitter'
    | 'walker'
    | 'trainer'
    | 'store';
  city: string;
  area: string;
  rating: number | null;
  reviews: number | null;
  open: string;
  species: SpeciesScope;
  note: string;
  verified: boolean;
}

export interface Bundle {
  id: string;
  name: string;
  species: SpeciesScope;
  line: string;
  productIds: string[];
  /** Slots we know a kit needs but have no verified product for yet. */
  gaps: string[];
}

export interface WellnessEntry {
  id: string;
  petId: string;
  kind:
    | 'weight'
    | 'vaccination'
    | 'grooming'
    | 'dental'
    | 'parasite'
    | 'medication'
    | 'vet-visit';
  date: string;
  label: string;
  value: string;
  done: boolean;
}

export interface ActivityEntry {
  id: string;
  petId: string;
  date: string;
  kind: 'walk' | 'play' | 'training' | 'run';
  minutes: number;
}
