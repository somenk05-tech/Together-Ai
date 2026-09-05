import type { DashaLord } from '../personal-factors';

/**
 * The gem marketplace's vocabulary, in one file so the catalogue, the
 * recommender and the controller cannot disagree about what a stone is.
 */

/** Lowercase in the owner's data; `DashaLord` is capitalised in the engine. */
export type GemPlanet = 'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter' | 'venus' | 'saturn' | 'rahu' | 'ketu';

export const PLANET_OF_LORD: Record<DashaLord, GemPlanet> = {
  Sun: 'sun', Moon: 'moon', Mars: 'mars', Mercury: 'mercury', Jupiter: 'jupiter',
  Venus: 'venus', Saturn: 'saturn', Rahu: 'rahu', Ketu: 'ketu',
};

/**
 * PRIMARY are the nine Navaratna, prescribed against a chart.
 * SUBSTITUTE are the sixteen upratna — the same planet at a fraction of the
 *   price, traditionally worn heavier to carry the same weight of intent.
 * WELLNESS are the five sold with no prescription at all: somebody who wants a
 *   rose quartz may simply have one, and no chart is consulted to allow it.
 */
export type GemKind = 'primary' | 'substitute' | 'wellness';

export interface GemTheme { background: string; title: string; body: string; accent: string }

export interface Gem {
  number: number;
  id: string;
  sku: string;
  name: string;
  planet: GemPlanet;
  numerologyNumber: number;
  kind: GemKind;
  /** For an upratna, the primary it stands in for. Null otherwise. */
  substituteFor: string | null;
  traits: string[];
  description: string;
  /** The owner's own paragraph on why a chart would call for it. */
  whyRecommended: string;
  wearingNote: string;
  image: string;
  imageAlt: string;
  perCaratMinInr: number;
  perCaratMaxInr: number;
  /** The card's own palette, from the owner's reference. Presentation only. */
  theme: GemTheme;
}
