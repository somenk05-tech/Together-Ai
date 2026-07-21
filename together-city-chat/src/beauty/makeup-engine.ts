/**
 * Together City — Makeup Studio engine.
 * A personal AI makeup artist, not a cosmetics store. Looks are composed from:
 *   ~50% AI face analysis (face/eye/brow/lip shape, cheekbones, jawline, maturity)
 *   ~25% skin analysis (finish, base products that suit the skin readings)
 *   ~15% personal colour analysis (undertone × depth → seasonal palette & shades)
 *   ~10% preferences (budget tiers, minimal vs glam via occasion)
 * Blood biomarkers play NO role here (the only skin inputs are the visual
 * assessment readings — e.g. dryness steering the foundation finish).
 */

export interface FaceAttrs {
  faceShape?: string; eyeShape?: string; eyeSize?: string; browShape?: string;
  lipShape?: string; cheekbones?: string; jawline?: string; maturity?: string;
  undertoneGuess?: string; depthGuess?: string;
}
export interface ReadingLite { key: string; label: string; level: string }

export const OCCASIONS = [
  'Everyday Natural', 'Office', 'No-Makeup Makeup', 'Date Night', 'Wedding Guest', 'Bridal',
  'Party', 'Festival', 'Vacation', 'Photoshoot', 'Professional Headshot', 'Evening Glam',
  'Red Carpet', 'Traditional Indian', 'Soft Korean Beauty', 'Clean Girl Aesthetic',
  'Old Money', 'Glass Skin', 'Editorial Fashion',
] as const;

type Finish = 'Matte' | 'Satin' | 'Dewy';

/** Occasion → look modifiers. */
const OCCASION_MOD: Record<string, { intensity: 'minimal' | 'soft' | 'medium' | 'full'; finish?: Finish; lipFamily: string; eyeNote: string }> = {
  'Everyday Natural': { intensity: 'soft', lipFamily: 'soft rose-nude', eyeNote: 'a wash of neutral shadow and one coat of mascara' },
  'Office': { intensity: 'soft', lipFamily: 'muted rose or brown-nude', eyeNote: 'matte neutral lid, thin liner, groomed brows' },
  'No-Makeup Makeup': { intensity: 'minimal', finish: 'Satin', lipFamily: 'your-lips-but-better tint', eyeNote: 'clear brow gel, curled lashes, no liner' },
  'Date Night': { intensity: 'medium', lipFamily: 'berry or warm red', eyeNote: 'soft smoke at the outer corner, fuller lashes' },
  'Wedding Guest': { intensity: 'medium', lipFamily: 'rose-mauve', eyeNote: 'shimmer on the lid centre, defined liner' },
  'Bridal': { intensity: 'full', finish: 'Satin', lipFamily: 'classic rose or soft red', eyeNote: 'long-wear layered shadow, waterproof liner & mascara' },
  'Party': { intensity: 'full', lipFamily: 'bold — red or deep berry', eyeNote: 'smoked liner, shimmer, dramatic lashes' },
  'Festival': { intensity: 'full', lipFamily: 'vivid warm red or orange-red', eyeNote: 'colour on the lid, gloss or glitter accents' },
  'Vacation': { intensity: 'minimal', finish: 'Dewy', lipFamily: 'sheer coral tint', eyeNote: 'waterproof mascara only' },
  'Photoshoot': { intensity: 'full', finish: 'Matte', lipFamily: 'true-tone nude or classic red', eyeNote: 'defined crease, matte finish photographs cleanly' },
  'Professional Headshot': { intensity: 'medium', finish: 'Matte', lipFamily: 'muted rose', eyeNote: 'matte definition, no shimmer — reads crisp on camera' },
  'Evening Glam': { intensity: 'full', lipFamily: 'deep berry or wine', eyeNote: 'full smoky eye, layered lashes' },
  'Red Carpet': { intensity: 'full', lipFamily: 'statement red', eyeNote: 'sculpted crease, winged liner, false-lash-level volume' },
  'Traditional Indian': { intensity: 'full', lipFamily: 'classic red or maroon', eyeNote: 'kajal-rimmed eyes, defined brows, a bindi-friendly clean base' },
  'Soft Korean Beauty': { intensity: 'soft', finish: 'Dewy', lipFamily: 'gradient pink-coral tint', eyeNote: 'straight soft brows, aegyo-sal highlight, skip harsh liner' },
  'Clean Girl Aesthetic': { intensity: 'minimal', finish: 'Dewy', lipFamily: 'sheer warm nude + gloss', eyeNote: 'brushed-up brows, curled bare lashes' },
  'Old Money': { intensity: 'soft', finish: 'Satin', lipFamily: 'muted rose-brown', eyeNote: 'quiet matte definition, impeccable brows' },
  'Glass Skin': { intensity: 'minimal', finish: 'Dewy', lipFamily: 'glossy pink tint', eyeNote: 'skip powder, highlight the high points, bare lashes' },
  'Editorial Fashion': { intensity: 'full', lipFamily: 'unexpected — deep plum or graphic red', eyeNote: 'graphic liner or a single bold colour statement' },
};

/** Face-shape → contour & blush placement. */
const FACE_TECH: Record<string, string> = {
  oval: 'Your oval face needs almost no correction — a whisper of contour under the cheekbone and blush on the apples is enough.',
  round: 'Contour along the temples and under the cheekbones to add definition; sweep blush slightly upward toward the ear to elongate.',
  square: 'Soften the angles — blend contour at the corners of the jaw and hairline; place blush on the rounds of the cheeks.',
  heart: 'Balance a wider forehead with a touch of contour at the temples; keep blush low on the apples and add a hint at the chin.',
  oblong: 'Shorten visually — contour along the hairline and the chin; place blush horizontally across the cheekbones.',
  diamond: 'Soften wide cheekbones with blush placed on the apples, and highlight the forehead centre and chin to balance.',
};
const EYE_TECH: Record<string, string> = {
  almond: 'Almond eyes carry nearly any liner — a classic flick follows your natural lift.',
  round: 'Elongate with a wing that extends past the outer corner; keep the lower lash line soft.',
  hooded: 'Tightline the upper lashes and lift the wing slightly ABOVE the fold so it stays visible; matte crease shades over shimmer.',
  monolid: 'A soft gradient of shadow from lash to brow flatters most; a thin liner that thickens at the outer third opens the eye.',
  downturned: 'Focus liner and shadow upward at the outer corner — a lifted wing counters the downturn beautifully.',
  upturned: 'Mirror your natural lift with liner along the upper lash line; smudge a little shadow at the outer lower corner to balance.',
};
const BROW_TECH: Record<string, string> = {
  straight: 'Keep your naturally straight brows — brush up and fill sparse spots; avoid forcing an arch.',
  'soft-arch': 'A soft arch frames most looks — define the tail lightly and keep the front diffused.',
  'high-arch': 'Your high arch is a feature — clean the underside and keep the tail sharp.',
  curved: 'Follow the natural curve; a slightly squared front modernises it.',
  thin: 'Fill with hair-like strokes a shade lighter than your hair, then set — density before darkness.',
  thick: 'Brush up with gel and clean only the outliers — full brows anchor every look here.',
};
const LIP_TECH: Record<string, string> = {
  full: 'Full lips: skip heavy liner — a precise edge in the same shade keeps them elegant.',
  thin: 'Overline by a hair on the cupid’s bow and centre only; gloss at the middle adds instant volume.',
  wide: 'Concentrate colour at the centre and diffuse to the corners for balance.',
  heart: 'Play up the cupid’s bow with a touch of highlighter above it.',
  balanced: 'Balanced lips take any technique — line, fill, done.',
};

/** Undertone × depth → shades. */
const DEPTH_FROM_TONE: Record<string, string> = {
  'very fair': 'fair', fair: 'fair', medium: 'medium', wheatish: 'medium', brown: 'tan', deep: 'deep',
};
const SEASON = (undertone: string, depth: string): string => {
  const light = depth === 'fair' || depth === 'light';
  if (undertone === 'warm') return light ? 'Spring (warm & light)' : 'Autumn (warm & deep)';
  if (undertone === 'cool') return light ? 'Summer (cool & light)' : 'Winter (cool & deep)';
  return light ? 'Soft Summer (neutral & light)' : 'Soft Autumn (neutral & deep)';
};
const PALETTE = (undertone: string, depth: string) => {
  const foundation = `${depth === 'fair' ? 'Fair' : depth === 'light' ? 'Light' : depth === 'medium' ? 'Medium' : depth === 'tan' ? 'Tan' : 'Deep'} with ${undertone === 'warm' ? 'golden/yellow' : undertone === 'cool' ? 'pink/rosy' : 'balanced neutral'} undertone`;
  const lips = undertone === 'warm'
    ? ['warm rose', 'terracotta', 'brick red', 'peach nude']
    : undertone === 'cool'
      ? ['blue-based red', 'mauve', 'berry', 'cool pink nude']
      : ['true red', 'dusty rose', 'soft berry', 'balanced nude'];
  const blush = undertone === 'warm' ? 'peach / warm coral' : undertone === 'cool' ? 'cool pink / soft plum' : 'muted rose';
  const eyes = undertone === 'warm' ? ['bronze', 'copper', 'warm brown', 'gold'] : undertone === 'cool' ? ['taupe', 'mauve', 'cool brown', 'silver'] : ['champagne', 'neutral brown', 'rosewood'];
  const highlighter = depth === 'tan' || depth === 'deep' ? 'golden bronze' : undertone === 'cool' ? 'pearl / icy pink' : 'champagne';
  return { foundation, concealer: `One shade lighter, same ${undertone} undertone`, lips, blush, eyes, highlighter };
};

export interface MakeupLook {
  occasion: string;
  occasions: string[];
  finish: Finish;
  season: string;
  palette: ReturnType<typeof PALETTE>;
  techniques: { area: string; tip: string }[];
  baseNotes: string[];
  explanation: string;
  inputs: { face: boolean; skin: boolean; colour: boolean };
}

export function buildMakeupLook(opts: {
  face: FaceAttrs | null;
  readings: ReadingLite[];
  skinTone?: string; undertone?: string;
  occasion?: string;
}): MakeupLook {
  const { face, readings } = opts;
  const occasion = OCCASIONS.includes((opts.occasion ?? '') as typeof OCCASIONS[number]) ? (opts.occasion as string) : 'Everyday Natural';
  const mod = OCCASION_MOD[occasion];

  // Colour analysis: profile answer first, AI face read as fallback.
  const dk = (v?: string) => !v || /don'?t know/i.test(v);
  const undertone = (!dk(opts.undertone) ? String(opts.undertone) : face?.undertoneGuess ?? 'neutral').toLowerCase();
  const depth = (!dk(opts.skinTone) ? DEPTH_FROM_TONE[String(opts.skinTone).toLowerCase()] : face?.depthGuess) ?? 'medium';
  const season = SEASON(undertone, depth);
  const palette = PALETTE(undertone, depth);

  // Skin analysis → base products & finish.
  const level = (key: string) => readings.find((r) => r.key === key)?.level ?? 'good';
  const oily = level('oil') !== 'good';
  const dry = level('hydration') !== 'good';
  const sensitive = level('redness') !== 'good';
  const acne = level('acne') !== 'good';
  const pores = level('texture') !== 'good';
  const lines = level('wrinkles') !== 'good';
  const finish: Finish = mod.finish ?? (oily ? 'Matte' : dry ? 'Dewy' : 'Satin');

  const baseNotes: string[] = [];
  baseNotes.push(pores ? 'Blurring primer on the T-zone to soften visible pores.' : 'A light gripping primer is all your smooth base needs.');
  baseNotes.push(`${finish}-finish ${acne ? 'non-comedogenic ' : ''}foundation${dry ? ' over generous moisturiser' : ''}${oily ? ', set through the T-zone' : ''}.`);
  if (sensitive) baseNotes.push('Fragrance-free formulas; a drop of green colour-corrector where redness shows.');
  if (lines || face?.maturity === 'mature') baseNotes.push('Cream textures over powder — powders settle into lines; set only where you crease.');
  if (level('pigmentation') !== 'good') baseNotes.push('Pin-point conceal spots after foundation rather than layering the whole face.');

  // Face techniques (the 50%).
  const techniques: { area: string; tip: string }[] = [];
  if (face?.faceShape && FACE_TECH[face.faceShape]) techniques.push({ area: 'Contour & blush', tip: FACE_TECH[face.faceShape] });
  if (face?.eyeShape && EYE_TECH[face.eyeShape]) techniques.push({ area: 'Eyes', tip: EYE_TECH[face.eyeShape] });
  if (face?.browShape && BROW_TECH[face.browShape]) techniques.push({ area: 'Brows', tip: BROW_TECH[face.browShape] });
  if (face?.lipShape && LIP_TECH[face.lipShape]) techniques.push({ area: 'Lips', tip: LIP_TECH[face.lipShape] });
  if (face?.cheekbones === 'high') techniques.push({ area: 'Highlight', tip: 'Your high cheekbones take highlighter beautifully — place it right on the bone, not above.' });
  if (face?.jawline === 'sharp') techniques.push({ area: 'Jawline', tip: 'A sharp jawline needs no contour below — keep product off the jaw to let it speak.' });
  techniques.push({ area: `For ${occasion}`, tip: `${mod.eyeNote.charAt(0).toUpperCase() + mod.eyeNote.slice(1)}; lips in ${mod.lipFamily}.` });

  const faceBits = [face?.faceShape && `${face.faceShape} face shape`, face?.eyeShape && `${face.eyeShape} eyes`, face?.lipShape && `${face.lipShape} lips`].filter(Boolean).join(', ');
  const skinBits = [oily && 'oilier T-zone', dry && 'dry patches', sensitive && 'some sensitivity', acne && 'breakout-prone areas'].filter(Boolean).join(', ');
  const explanation =
    `We built this ${occasion} look ${faceBits ? `around your AI face analysis — ${faceBits} — which sets the contour, liner and lip technique. ` : `from your profile (add photos for face-shape-level precision). `}`
    + `Your skin analysis${skinBits ? ` (${skinBits})` : ''} chose the ${finish.toLowerCase()} finish and base formulas. `
    + `Colour-wise you read as ${undertone} undertone, ${depth} depth — the ${season} palette — so shades like ${palette.lips.slice(0, 2).join(' and ')} will sit naturally on you. `
    + `Blood biomarkers are not used for makeup.`;

  return {
    occasion, occasions: [...OCCASIONS], finish, season, palette, techniques, baseNotes, explanation,
    inputs: { face: Boolean(face && Object.keys(face).length), skin: readings.length > 0, colour: !dk(opts.undertone) || Boolean(face?.undertoneGuess) },
  };
}
