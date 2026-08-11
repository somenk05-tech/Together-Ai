import type { DashaLord } from '../personal-factors';
import type { GemPlanet } from './gem-types';

/**
 * How a stone is worn — metal, finger, hand, day — and it is ONE TABLE.
 *
 * WHY THIS FILE EXISTS AT ALL. The same nine rows arrived twice: once in
 * `gem-remedy-content.ts`, written months ago for the remedies page, and again
 * inside the owner's ring-studio reference. They agreed on eight planets and
 * disagreed on the ninth — Ketu's stone on the little finger in one and the
 * middle finger in the other, first worn on a Thursday in one and "Tuesday or
 * Thursday" in the other. Nothing was broken, because the two tables were read
 * by two pages that nobody compares side by side.
 *
 * That is the shape of every expensive bug in this codebase: two answers to one
 * question, both confident, discovered by a citizen rather than by us. So the
 * remedies page and the gem marketplace read this file and no other, and a test
 * asserts that `gem-remedy-content.ts` agrees with it row for row.
 *
 * WHERE THE VALUES COME FROM: the owner's ring-studio file, as the later and
 * richer of the two — it adds the hand, the allied planets and the softness
 * flag that the ring designs are ranked by. The Ketu row is therefore the ring
 * studio's, and the divergence is written down here rather than resolved
 * quietly.
 */

export interface WearingRule {
  /** What it is traditionally set in. */
  metal: string;
  /** The finger it is worn on — the thing citizens ask first. */
  finger: string;
  /** Right hand throughout in this tradition; kept as a field because it is
   *  asked as often as the finger and should not be folded into prose. */
  hand: string;
  /** The day it is first put on. */
  day: string;
  /** Planets whose stones may share a setting with this one. Three-stone and
   *  halo designs are ranked against this. */
  allies: GemPlanet[];
  /** Physically soft — pearl and coral. A tension setting will crack these,
   *  which is a durability fact rather than an astrological one. */
  soft: boolean;
}

export const WEARING: Record<GemPlanet, WearingRule> = {
  sun: { metal: 'Gold or panchdhatu', finger: 'Ring finger', hand: 'Right hand', day: 'Sunday', allies: ['moon', 'mars', 'jupiter'], soft: false },
  moon: { metal: 'Silver', finger: 'Little finger', hand: 'Right hand', day: 'Monday', allies: ['sun', 'mercury'], soft: true },
  mars: { metal: 'Gold or copper', finger: 'Ring finger', hand: 'Right hand', day: 'Tuesday', allies: ['sun', 'moon', 'jupiter'], soft: true },
  mercury: { metal: 'Gold', finger: 'Little finger', hand: 'Right hand', day: 'Wednesday', allies: ['sun', 'venus'], soft: false },
  jupiter: { metal: 'Gold', finger: 'Index finger', hand: 'Right hand', day: 'Thursday', allies: ['sun', 'moon', 'mars'], soft: false },
  venus: { metal: 'Platinum or white gold', finger: 'Middle finger', hand: 'Right hand', day: 'Friday', allies: ['mercury', 'saturn'], soft: false },
  saturn: { metal: 'Silver or panchdhatu', finger: 'Middle finger', hand: 'Right hand', day: 'Saturday', allies: ['mercury', 'venus'], soft: false },
  rahu: { metal: 'Silver or ashtadhatu', finger: 'Middle finger', hand: 'Right hand', day: 'Saturday', allies: ['venus', 'saturn'], soft: false },
  ketu: { metal: 'Silver', finger: 'Middle finger', hand: 'Right hand', day: 'Tuesday or Thursday', allies: ['mars', 'venus', 'saturn'], soft: false },
};

/**
 * The three stones that are never simply sold.
 *
 * Named in the data sheet as carrying a MANDATORY 72-hour trial: blue sapphire,
 * hessonite and cat's eye are the stones traditional practice says to wear
 * briefly and observe before committing — and they are, not coincidentally,
 * three of the more expensive things in the catalogue. The flag travels with
 * the recommendation so the surface cannot forget to say it.
 */
export const TRIAL_REQUIRED = new Set(['blue-sapphire', 'hessonite', 'cats-eye']);

export const TRIAL_NOTE =
  'Traditionally worn on trial for 72 hours before it is commissioned. Wear it, sleep with it, and pay attention '
  + 'to how the three days go before you have it set.';

/** The lowercase planet key for an engine lord. */
export const planetOf = (lord: DashaLord): GemPlanet =>
  lord.toLowerCase() as GemPlanet;
