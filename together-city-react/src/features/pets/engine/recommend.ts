/**
 * ── WHY THIS PRODUCT, FOR THIS PET ──────────────────────────────────────────
 *
 * A recommendation with no reason attached is an advertisement. Every product
 * this module returns carries the sentence that put it there, and the sentence
 * is assembled from facts on the pet's own profile — species, life stage, size,
 * the goal the owner chose, the allergy they typed.
 *
 * WHAT IT WILL NOT SAY. It never claims a product treats, prevents or cures
 * anything. Veterinary diets and parasiticides score in the catalogue like
 * everything else, but they surface with a vet-guidance flag and a reason that
 * says "your vet decides this one", because they are prescription-channel
 * products and a shopping engine has no business implying otherwise.
 *
 * SCORING IS ADDITIVE AND SMALL ON PURPOSE. Six or seven rules that a person
 * can read beats a weighting nobody can audit — and when the catalogue is
 * mostly missing guaranteed-analysis data, a sophisticated nutritional score
 * would be sophistication applied to absent numbers.
 */

import type { Pet, Product, ProductCategory } from '../types';
import { CATALOGUE } from '../data/catalogue';
import { readAge } from './nutrition';
import { productAllowed } from './plan';

export interface Recommendation {
  product: Product;
  score: number;
  reasons: string[];
  caution: string | null;
}

const SIZE_WORDS: Record<string, string[]> = {
  small: ['small', 'mini', 'toy'],
  medium: ['medium'],
  large: ['large', 'maxi', 'giant'],
};

function sizeOf(pet: Pet): 'small' | 'medium' | 'large' {
  const kg = pet.weightKg ?? 0;
  if (pet.species === 'cat') return 'small';
  if (kg >= 25) return 'large';
  if (kg >= 10) return 'medium';
  return 'small';
}

export function scoreProduct(product: Product, pet: Pet): Recommendation | null {
  if (product.species !== 'both' && product.species !== pet.species) return null;
  if (!productAllowed(product, pet)) return null;

  const age = readAge(pet);
  const reasons: string[] = [];
  let score = 1;

  // The species line is scored but NOT pushed as a reason yet: "made for dogs"
  // is true of most of the shelf and reads as filler beside a real one. It is
  // appended at the end only if nothing more specific was found.
  if (product.species === pet.species) score += 2;

  if (product.lifeStage !== 'all') {
    if (product.lifeStage === age.stage) {
      score += 3;
      reasons.push(`Formulated for the ${age.stage} stage — ${pet.name} is ${age.label}`);
    } else if (
      (age.stage === 'senior' && product.lifeStage === 'adult') ||
      (age.stage === 'adult' && product.lifeStage === 'adult')
    ) {
      score += 1;
      reasons.push('Adult formulation');
    } else {
      return null; // a puppy food for a senior cat is not a weak match, it is wrong
    }
  }

  const size = sizeOf(pet);
  const breedWords = SIZE_WORDS[size] ?? [];
  const hay = `${product.name} ${product.breedSize} ${product.subcategory}`.toLowerCase();
  if (breedWords.some((w) => hay.includes(w))) {
    score += 2;
    reasons.push(`Sized for a ${size} ${pet.species} — ${pet.weightKg ?? '?'} kg`);
  }

  if (pet.goal === 'weight-loss' && /satiety|weight|light|slim/.test(hay)) {
    score += 3;
    reasons.push('Positioned for weight management, which is the goal on this profile');
  }
  if (pet.goal === 'growth' && /starter|puppy|kitten|growth|junior/.test(hay)) {
    score += 3;
    reasons.push('A growth formulation');
  }
  if (pet.housing === 'indoor' && /indoor|hairball/.test(hay)) {
    score += 2;
    reasons.push('Indoor formulation — matches how this pet lives');
  }
  if (pet.activity === 'high' && /active|energy|sport|performance/.test(hay)) {
    score += 1;
    reasons.push('Higher-energy positioning for an active pet');
  }
  if (product.verified.price) score += 1;
  if (product.verified.nutrition) {
    score += 2;
    reasons.push('Guaranteed analysis published on the retailer page');
  }

  let caution: string | null = null;
  if (product.vetGuidance) {
    caution = product.category === 'vet-diet'
      ? 'Veterinary diet — your vet decides whether this is right, and for how long.'
      : 'Health-claim or prescription-channel product. Use under veterinary guidance.';
    score -= 2;
  }
  if (!product.verified.price) {
    reasons.push('Price not verified at the source — confirm before ordering');
  }

  if (reasons.length === 0) {
    reasons.push(`Suitable for ${pet.species === 'dog' ? 'dogs' : 'cats'} at ${pet.name}’s life stage`);
  }
  return { product, score, reasons: reasons.slice(0, 4), caution };
}

/**
 * ONE PRODUCT PER BRAND IN A RAIL.
 *
 * Without this the treats rail returned three sizes of the same Dentastix,
 * which is a shelf of one product wearing three hats. A rail is a choice or it
 * is nothing, so the best-scoring entry per brand goes in and the rest wait for
 * the full grid underneath.
 */
export function recommendFor(pet: Pet, category: ProductCategory, limit = 3): Recommendation[] {
  const ranked = CATALOGUE
    .filter((p) => p.category === category)
    .map((p) => scoreProduct(p, pet))
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => b.score - a.score || (a.product.priceFrom ?? 1e9) - (b.product.priceFrom ?? 1e9));

  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const rec of ranked) {
    if (seen.has(rec.product.brand)) continue;
    seen.add(rec.product.brand);
    out.push(rec);
    if (out.length === limit) break;
  }
  // A category with fewer brands than slots still fills up rather than showing a gap.
  for (const rec of ranked) {
    if (out.length === limit) break;
    if (!out.includes(rec)) out.push(rec);
  }
  return out;
}

/** The six rails on the "Recommended for <pet>" page. */
export const RECOMMENDED_RAILS: { category: ProductCategory; label: string; line: string }[] = [
  { category: 'food', label: 'Food', line: 'Complete and balanced diets that match the profile' },
  { category: 'treats', label: 'Treats', line: 'Inside the 10% treat budget' },
  { category: 'toys', label: 'Toys', line: 'Enrichment for the activity level on file' },
  { category: 'walk', label: 'Walk', line: 'Collars, leashes and harnesses at this size' },
  { category: 'grooming', label: 'Grooming', line: 'Coat and skin care for this breed' },
  { category: 'wellness', label: 'Wellness', line: 'Supplements and parasite control — vet-guided' },
];
