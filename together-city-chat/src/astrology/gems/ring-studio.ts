import type { GemPlanet } from './gem-types';
import { WEARING } from './wearing';

/**
 * The ring studio — the owner's own file, turned into data.
 *
 * TEN SHAPES AND EIGHT SETTINGS, each with the line drawing it was drawn with.
 * No photography and none needed: the reference is line art, which is the right
 * register for a choice about form. A photograph of somebody else's ring would
 * be a picture of a thing we are not selling.
 *
 * THE RANKING IS THE OWNER'S TOO, and it is the reason this is not a jewellery
 * configurator with an astrology skin. A setting is not neutral: the open back
 * is the whole point of a prescription mount, because the stone is meant to
 * touch the skin. So an eternity band is fashion wear whatever the chart says,
 * a tension setting will crack a pearl or a coral, and a three-stone only works
 * if the other two stones are the planet's allies.
 *
 * GENERATED-ADJACENT: the SVG strings and the copy come verbatim from
 * ringstudio_3.html. The judgements below — which setting suits which planet —
 * are that file's `designStatus` function, transcribed rather than reinvented.
 */

export interface StudioOption { key: string; name: string; desc: string; svg: string }

/** How a stone is cut. Jyotish favours cuts that keep weight and purity. */
export const STONE_SHAPES: StudioOption[] = [
  { key: 'round', name: 'Round', desc: 'Maximum brilliance; classic for diamond & white sapphire',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke" cx="50" cy="50" r="34"/><circle class="fine" cx="50" cy="50" r="20"/><path class="fine" d="M50 16v68M16 50h68M26 26l48 48M74 26l-48 48"/></svg>' },
  { key: 'oval', name: 'Oval', desc: 'The traditional Jyotish cut — keeps carat weight, flatters every stone',
    svg: '<svg viewBox="0 0 100 100"><ellipse class="stroke" cx="50" cy="50" rx="26" ry="36"/><ellipse class="fine" cx="50" cy="50" rx="14" ry="22"/><path class="fine" d="M50 14v72M24 50h52"/></svg>' },
  { key: 'cushion', name: 'Cushion', desc: 'Soft square, vintage warmth; favoured for ruby & yellow sapphire',
    svg: '<svg viewBox="0 0 100 100"><rect class="stroke" x="20" y="20" width="60" height="60" rx="16"/><rect class="fine" x="33" y="33" width="34" height="34" rx="9"/><path class="fine" d="M20 20l13 13M80 20l-13 13M20 80l13-13M80 80l-13-13"/></svg>' },
  { key: 'emerald-cut', name: 'Emerald Cut', desc: 'Stepped hall-of-mirrors; shows clarity honestly — emerald\'s own cut',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M30 20h40l10 12v36l-10 12H30l-10-12V32z"/><rect class="fine" x="32" y="32" width="36" height="36"/><rect class="fine" x="40" y="40" width="20" height="20"/></svg>' },
  { key: 'pear', name: 'Pear', desc: 'Teardrop grace; elongates the finger',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M50 14c22 22 24 34 24 46a24 24 0 0 1-48 0c0-12 2-24 24-46z"/><path class="fine" d="M50 22v62M32 60h36"/></svg>' },
  { key: 'marquise', name: 'Marquise', desc: 'Regal boat shape; large look per carat',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M50 12c14 14 18 26 18 38s-4 24-18 38c-14-14-18-26-18-38s4-24 18-38z"/><path class="fine" d="M50 20v60"/></svg>' },
  { key: 'princess', name: 'Princess', desc: 'Sharp modern square, lively sparkle',
    svg: '<svg viewBox="0 0 100 100"><rect class="stroke" x="22" y="22" width="56" height="56"/><path class="fine" d="M22 22l56 56M78 22l-56 56M50 22v56M22 50h56"/></svg>' },
  { key: 'heart', name: 'Heart', desc: 'Romantic statement; Venus stones love it',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M50 82C30 66 20 54 20 42a15 15 0 0 1 30-4 15 15 0 0 1 30 4c0 12-10 24-30 40z"/></svg>' },
  { key: 'cabochon', name: 'Cabochon', desc: 'Smooth dome — mandatory for cat\'s eye, moonstone, coral & turquoise',
    svg: '<svg viewBox="0 0 100 100"><ellipse class="stroke" cx="50" cy="54" rx="32" ry="24"/><path class="fine" d="M22 54a32 18 0 0 1 56 0"/></svg>' },
  { key: 'trillion', name: 'Trillion', desc: 'Bold triangle; contemporary accent cut',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M50 18l30 52H20z"/><path class="fine" d="M50 30l20 34M50 30L30 64M36 52h28"/></svg>' },
];

/** How it is mounted. */
export const RING_SETTINGS: StudioOption[] = [
  { key: 'solitaire', name: 'Solitaire', desc: 'One stone, raised prongs, open back — the classic Jyotish mount',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="58" r="26"/><path class="stroke2" d="M42 30l8-14 8 14"/><circle class="stroke" cx="50" cy="24" r="9"/></svg>' },
  { key: 'halo', name: 'Halo', desc: 'Centre stone ringed by small accents; adds size and fire',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="60" r="24"/><circle class="stroke" cx="50" cy="24" r="8"/><circle class="fine" cx="50" cy="24" r="14"/></svg>' },
  { key: 'three-stone', name: 'Three-Stone', desc: 'Past · present · future; pairs a primary gem with allies (check compatibility!)',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="62" r="23"/><circle class="stroke" cx="50" cy="24" r="8"/><circle class="stroke" cx="30" cy="28" r="5.5"/><circle class="stroke" cx="70" cy="28" r="5.5"/></svg>' },
  { key: 'bezel', name: 'Bezel', desc: 'Metal rim guards the stone; secure for daily wear, kept open beneath',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="60" r="24"/><circle class="stroke2" cx="50" cy="26" r="12"/><circle class="stroke" cx="50" cy="26" r="7"/></svg>' },
  { key: 'cluster', name: 'Cluster', desc: 'Small stones massed as one; navaratna clusters carry all nine gems',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="62" r="23"/><circle class="stroke" cx="50" cy="20" r="6"/><circle class="stroke" cx="38" cy="28" r="5"/><circle class="stroke" cx="62" cy="28" r="5"/><circle class="stroke" cx="44" cy="36" r="4"/><circle class="stroke" cx="56" cy="36" r="4"/></svg>' },
  { key: 'eternity', name: 'Eternity Band', desc: 'Stones the whole way round; jewellery wear, not prescription wear',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="50" r="28"/><circle class="fine2" cx="50" cy="50" r="20"/><circle class="stroke" cx="50" cy="22" r="3.5"/><circle class="stroke" cx="70" cy="30" r="3.5"/><circle class="stroke" cx="78" cy="50" r="3.5"/><circle class="stroke" cx="70" cy="70" r="3.5"/><circle class="stroke" cx="50" cy="78" r="3.5"/><circle class="stroke" cx="30" cy="70" r="3.5"/><circle class="stroke" cx="22" cy="50" r="3.5"/><circle class="stroke" cx="30" cy="30" r="3.5"/></svg>' },
  { key: 'split-shank', name: 'Split Shank', desc: 'Band divides toward the stone; airy, modern',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke2" d="M26 74a26 26 0 0 1 0-37l10 9a13 13 0 0 0 0 19z"/><path class="stroke2" d="M74 74a26 26 0 0 0 0-37l-10 9a13 13 0 0 1 0 19z"/><circle class="stroke" cx="50" cy="42" r="8"/></svg>' },
  { key: 'tension', name: 'Tension / Floating', desc: 'Stone held between band ends — maximum skin contact',
    svg: '<svg viewBox="0 0 100 100"><circle class="stroke2" cx="50" cy="58" r="25"/><path class="stroke" d="M34 30q16-18 32 0"/><circle class="stroke" cx="50" cy="24" r="7"/></svg>' },
];

/**
 * Whether a setting is recommended, merely suitable, or to be avoided — for
 * THIS planet's stone.
 *
 *   'recommended'  tradition points at it
 *   'suitable'     nothing against it
 *   'avoid'        a real reason not to, and the reason is given
 */
export type DesignVerdict = 'recommended' | 'suitable' | 'avoid';

export interface DesignAdvice { verdict: DesignVerdict; why: string }

const SOFT_STONES = 'a stone this soft will crack under tension';

export function adviseSetting(setting: string, planet: GemPlanet): DesignAdvice {
  const w = WEARING[planet];
  const allies = w.allies.join(', ');
  switch (setting) {
    case 'solitaire':
      return { verdict: 'recommended', why: 'The classic open-back prescription mount — one stone, raised prongs, nothing between it and the skin.' };
    case 'bezel':
      return w.soft || planet === 'saturn' || planet === 'rahu' || planet === 'ketu'
        ? { verdict: 'recommended', why: 'A metal rim guards the stone. Keep the back open.' }
        : { verdict: 'suitable', why: 'Secure for daily wear, and the back stays open.' };
    case 'tension':
      return w.soft
        ? { verdict: 'avoid', why: `Maximum skin contact, but ${SOFT_STONES}.` }
        : planet === 'venus'
          ? { verdict: 'recommended', why: 'Maximum skin contact, and the stone is hard enough to be held this way.' }
          : { verdict: 'suitable', why: 'Excellent skin contact.' };
    case 'halo':
      return planet === 'venus'
        ? { verdict: 'recommended', why: 'Venus carries the extra fire well.' }
        : { verdict: 'suitable', why: 'Fine as jewellery — the accent stones must not be enemy stones.' };
    case 'three-stone':
      return { verdict: 'suitable', why: `Only alongside allied stones: ${allies}.` };
    case 'cluster':
      return { verdict: 'suitable', why: 'A navaratna cluster carries all nine — the universal choice when no single stone is prescribed.' };
    case 'eternity':
      return { verdict: 'avoid', why: 'Fashion wear only. Stones the whole way round and no open back.' };
    case 'split-shank':
      return { verdict: 'suitable', why: 'A fashion setting, fine as long as the mount stays open beneath.' };
    default:
      return { verdict: 'suitable', why: '' };
  }
}

/**
 * Pendant styles. The alternative when a ring is not wanted — and for some
 * people it is the only option, because a stone on the chest is worn against
 * the skin just as a ring is.
 */
export const PENDANT_STYLES: StudioOption[] = [
  { key: 'minimal', name: 'Minimal', desc: 'A bezel and a bail, nothing else — the stone does the talking',
    svg: '<svg viewBox="0 0 100 100"><ellipse class="stroke" cx="50" cy="58" rx="22" ry="28"/><path class="fine" d="M50 30v-8a7 7 0 0 1 14 0"/></svg>' },
  { key: 'classic', name: 'Classic', desc: 'Prongs and a fine chain, the way a prescribed stone is usually set',
    svg: '<svg viewBox="0 0 100 100"><ellipse class="stroke" cx="50" cy="58" rx="20" ry="26"/><path class="fine" d="M34 44l32 28M66 44L34 72"/><path class="fine" d="M50 32v-9a7 7 0 0 1 14 0"/></svg>' },
  { key: 'traditional', name: 'Traditional', desc: 'A worked gold frame in the Indian manner, open at the back',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M50 30c14 0 24 12 24 28S64 90 50 90 26 74 26 58s10-28 24-28z"/><ellipse class="fine" cx="50" cy="58" rx="13" ry="17"/><path class="fine" d="M50 30v-8a7 7 0 0 1 14 0"/></svg>' },
  { key: 'contemporary', name: 'Contemporary', desc: 'An open geometric mount; the most skin contact of the four',
    svg: '<svg viewBox="0 0 100 100"><path class="stroke" d="M30 40h40L50 88z"/><ellipse class="fine" cx="50" cy="54" rx="12" ry="14"/><path class="fine" d="M50 34v-8a7 7 0 0 1 14 0"/></svg>' },
];

/**
 * Indian ring sizes, with the finger measurements that decide them.
 *
 * From the owner's chart. Sizes 6 to 30 is the range Indian jewellers work in;
 * diameter is the number a jeweller measures and circumference the one a strip
 * of paper gives you, so both are here.
 */
export interface RingSize { indian: number; diameterMm: number; circumferenceMm: number }

export const RING_SIZES: RingSize[] = Array.from({ length: 25 }, (_, i) => {
  const indian = i + 6;
  // The Indian scale steps a shade over a third of a millimetre of diameter per
  // size, from 14.0mm at size 6 — the standard progression, rounded the way a
  // chart prints it.
  const diameterMm = Math.round((14.0 + i * 0.406) * 10) / 10;
  return { indian, diameterMm, circumferenceMm: Math.round(diameterMm * Math.PI * 10) / 10 };
});
