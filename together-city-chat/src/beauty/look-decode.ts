/**
 * Turning a reference photo into steps somebody can follow.
 *
 * The vision model reads the LOOK — finish, intensity, palette, where the
 * emphasis sits. This module turns that reading into an ordered routine and
 * matches it to the shelf. Keeping the two apart means the steps are testable
 * without a model, and a change of vision provider cannot change the makeup
 * advice underneath it.
 *
 * When no model is available the attributes come back as a neutral, honestly
 * labelled default rather than an invention — `readBy: 'fallback'` and a
 * confidence of 0 — so the citizen is told the photo was not actually read.
 */

import { isTopicallySafe } from '../shared/topical-sensitivities';

export type Finish = 'matte' | 'dewy' | 'natural';
export type Intensity = 'soft' | 'medium' | 'bold';
export type Focus = 'eyes' | 'lips' | 'balanced';

export interface LookAttributes {
  finish: Finish;
  intensity: Intensity;
  focus: Focus;
  /** Free-text palette description, e.g. "warm bronze and soft coral". */
  palette: string;
  /** Anything notable the reader saw — winged liner, gloss, sharp contour. */
  features: string[];
}

export interface LookStep {
  order: number;
  step: string;
  how: string;
  /** Product categories from the beauty shelf that serve this step. */
  categories: string[];
}

export const NEUTRAL_ATTRIBUTES: LookAttributes = {
  finish: 'natural',
  intensity: 'medium',
  focus: 'balanced',
  palette: 'neutral everyday tones',
  features: [],
};

/** Every look is built in this order; steps drop out when they do not apply. */
const BASE_STEPS: Array<{
  step: string;
  categories: string[];
  how: (a: LookAttributes) => string | null;
}> = [
  {
    step: 'Prep',
    categories: ['Moisturiser', 'Sunscreen'],
    how: (a) => a.finish === 'dewy'
      ? 'Moisturise generously and let it settle — a dewy finish is mostly skin, not product.'
      : 'Moisturise lightly and let it absorb fully so base sits evenly rather than lifting.',
  },
  {
    step: 'Base',
    categories: ['Foundation', 'Serum'],
    how: (a) => a.finish === 'matte'
      ? 'Thin layers of a matte base, building only where you need it. Powder the centre of the face only.'
      : a.finish === 'dewy'
        ? 'Sheer base pressed in with fingers or a damp sponge, leaving the high points bare.'
        : 'An even, light base — the aim is your skin on a good day rather than a mask.',
  },
  {
    step: 'Eyes',
    categories: ['Makeup'],
    how: (a) => a.focus === 'lips'
      ? 'Keep the eyes quiet: a wash of a single neutral shade and mascara, nothing more.'
      : a.intensity === 'bold'
        ? `Build depth through the socket in ${a.palette}, blend past the crease, then line and smoke the lash lines.`
        : `A soft wash in ${a.palette}, blended up and out, with definition kept close to the lashes.`,
  },
  {
    step: 'Cheeks',
    categories: ['Makeup'],
    how: (a) => a.intensity === 'bold'
      ? 'Colour placed high on the cheekbone and blended towards the temple; a defined contour underneath.'
      : 'A light flush on the apples, blended back — the point is warmth, not shape.',
  },
  {
    step: 'Lips',
    categories: ['Makeup'],
    how: (a) => a.focus === 'eyes'
      ? 'Keep lips understated — a balm or a sheer tint close to your own colour.'
      : a.intensity === 'bold'
        ? `A defined lip in ${a.palette} — line first, fill, then blot and reapply so it lasts.`
        : `A soft wash of colour pressed on with a fingertip, kept slightly diffuse at the edge.`,
  },
  {
    step: 'Set',
    categories: ['Makeup'],
    how: (a) => a.finish === 'dewy'
      ? 'Skip powder almost entirely; a light mist to melt everything together.'
      : a.finish === 'matte'
        ? 'Set where you shine and nowhere else, then mist to take the powderiness off.'
        : 'A light mist only — setting everything flattens the look you have just built.',
  },
];

/** The ordered routine implied by a set of attributes. */
export function stepsFor(attributes: LookAttributes): LookStep[] {
  const out: LookStep[] = [];
  for (const s of BASE_STEPS) {
    const how = s.how(attributes);
    if (!how) continue;
    out.push({ order: out.length + 1, step: s.step, how, categories: s.categories });
  }
  return out;
}

export interface ShelfProduct {
  id: string; name: string; category: string; suitableSkin: string[]; actives: string[];
  /** The printed ingredient list, when the shelf carries one — read by the
   *  allergy guard alongside the actives (3 Sep). */
  ingredients?: string[];
}
export interface ProductMatch { stepOrder: number; step: string; productId: string; name: string }

/**
 * Match shelf products to steps.
 *
 * Anything containing a declared allergen is excluded before matching, not
 * filtered from the result afterwards — a product that should never be
 * recommended should never reach the list in the first place.
 */
export function matchProducts(
  steps: LookStep[],
  shelf: ShelfProduct[],
  opts: { allergies?: string[]; skinType?: string } = {},
): ProductMatch[] {
  const allergies = (opts.allergies ?? []).map((a) => a.toLowerCase()).filter(Boolean);
  const skin = (opts.skinType ?? '').toLowerCase();

  const safe = shelf.filter((p) => {
    // The header above says "anything containing a declared allergen is excluded
    // before matching, not filtered from the result afterwards". That was true
    // of the ORDER of operations and false of the exclusion itself, which was
    // `haystack.includes(declaredTerm)` — a test that finds almond oil only for
    // somebody who wrote "almond".
    if (!isTopicallySafe(p.name, [...p.actives, ...(p.ingredients ?? [])], allergies)) return false;
    if (skin && p.suitableSkin.length && !p.suitableSkin.includes('all') && !p.suitableSkin.includes(skin)) return false;
    return true;
  });

  const out: ProductMatch[] = [];
  for (const s of steps) {
    // Categories are listed in PRIORITY order — a Base step prefers a foundation
    // over a serum. Iterating the shelf instead would let shelf order decide,
    // which silently ignored the preference the step had expressed.
    let hit: ShelfProduct | undefined;
    for (const category of s.categories) {
      hit = safe.find((p) => p.category === category);
      if (hit) break;
    }
    if (hit) out.push({ stepOrder: s.order, step: s.step, productId: hit.id, name: hit.name });
  }
  return out;
}

/** Coerce whatever a vision model returned into attributes we can rely on. */
export function normaliseAttributes(raw: unknown): { attributes: LookAttributes; confident: boolean } {
  if (!raw || typeof raw !== 'object') return { attributes: NEUTRAL_ATTRIBUTES, confident: false };
  const r = raw as Record<string, unknown>;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

  const attributes: LookAttributes = {
    finish: oneOf(r.finish, ['matte', 'dewy', 'natural'] as const, 'natural'),
    intensity: oneOf(r.intensity, ['soft', 'medium', 'bold'] as const, 'medium'),
    focus: oneOf(r.focus, ['eyes', 'lips', 'balanced'] as const, 'balanced'),
    palette: typeof r.palette === 'string' && r.palette.trim() ? r.palette.trim().slice(0, 120) : NEUTRAL_ATTRIBUTES.palette,
    features: Array.isArray(r.features) ? r.features.filter((f): f is string => typeof f === 'string').slice(0, 8) : [],
  };
  // Confident only when the model actually committed to the three that change
  // the steps — anything else and we are describing a default, not a photo.
  const confident = ['finish', 'intensity', 'focus'].every((k) => typeof r[k] === 'string');
  return { attributes, confident };
}
