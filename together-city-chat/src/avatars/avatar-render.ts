import { inputsKey, type AvatarInputs, type Background, type EyeColour, type HairColour, type SkinTone } from './avatar-inputs';

/**
 * A portrait drawn from choices, with no model involved.
 *
 * This exists so the feature is real before anyone pays for a generation API.
 * It draws SVG — vector, a couple of kilobytes, sharp at any size — from the
 * citizen's catalogue choices and nothing else. No randomness anywhere, so the
 * same choices give the same face on every deploy and the whole thing can be
 * asserted in a test rather than looked at.
 *
 * What it must never do is pretend to be something it is not. Everything it
 * produces is labelled `generatedBy: 'deterministic'` all the way to the API
 * response, exactly as the makeup reader distinguishes a real vision read from
 * its fallback. A citizen choosing an avatar deserves to know whether a model
 * drew it or a function did.
 */

const SKIN: Record<SkinTone, { base: string; shade: string }> = {
  porcelain: { base: '#f7e0d3', shade: '#e6c3b0' },
  fair: { base: '#f2d3bd', shade: '#dcb59c' },
  light: { base: '#e8bd9a', shade: '#cfa07c' },
  olive: { base: '#d9a679', shade: '#bd8858' },
  tan: { base: '#c68642', shade: '#a56c31' },
  brown: { base: '#a1663b', shade: '#84502c' },
  deep: { base: '#7a4a2b', shade: '#5f371e' },
  rich: { base: '#4c2c17', shade: '#3a2010' },
};

const HAIR: Record<HairColour, string> = {
  black: '#1b1614',
  darkBrown: '#3a2a20',
  brown: '#6b4a32',
  auburn: '#8a3d24',
  blonde: '#d8ad63',
  grey: '#9c9a97',
  white: '#e8e6e3',
  red: '#b1462a',
};

const EYES: Record<EyeColour, string> = {
  brown: '#6b4423',
  darkBrown: '#3d2716',
  hazel: '#8a6b3a',
  green: '#4a7a4f',
  blue: '#3f6f9e',
  grey: '#7a8288',
};

const BG: Record<Background, [string, string]> = {
  dawn: ['#ffd9a8', '#ff9a76'],
  sky: ['#bfe3ff', '#7fb6e8'],
  forest: ['#c8e6c9', '#7bab86'],
  sand: ['#f3e2c7', '#d9bd93'],
  plum: ['#e2ccf0', '#a97fc4'],
  slate: ['#d6dde3', '#9aa8b4'],
  rose: ['#fbd5de', '#e493aa'],
  mint: ['#cdf0e6', '#83c9b8'],
};

/** Hair drawn BEHIND the head — the silhouette that gives a style its shape. */
function hairBack(inputs: AvatarInputs, colour: string): string {
  switch (inputs.hairStyle) {
    case 'long':
      return `<path d="M50 96 C50 52 78 34 100 34 C122 34 150 52 150 96 L150 160 L131 160 L131 104 L69 104 L69 160 L50 160 Z" fill="${colour}"/>`;
    case 'braids':
      return `<path d="M52 96 C52 54 78 36 100 36 C122 36 148 54 148 96 L148 150 L136 150 L136 100 L64 100 L64 150 L52 150 Z" fill="${colour}"/>` +
        `<circle cx="58" cy="150" r="7" fill="${colour}"/><circle cx="142" cy="150" r="7" fill="${colour}"/>`;
    case 'afro':
      return `<circle cx="100" cy="86" r="56" fill="${colour}"/>`;
    case 'bun':
      return `<circle cx="100" cy="38" r="16" fill="${colour}"/>`;
    case 'curly':
      return `<circle cx="66" cy="76" r="20" fill="${colour}"/><circle cx="134" cy="76" r="20" fill="${colour}"/>`;
    default:
      return '';
  }
}

/** Hair drawn OVER the head — the fringe and hairline. */
function hairFront(inputs: AvatarInputs, colour: string): string {
  if (inputs.hairStyle === 'bald') return '';
  const cap = `<path d="M60 88 C60 56 78 42 100 42 C122 42 140 56 140 88 C140 74 126 66 100 66 C74 66 60 74 60 88 Z" fill="${colour}"/>`;
  switch (inputs.hairStyle) {
    case 'buzz':
      return `<path d="M62 88 C62 58 79 46 100 46 C121 46 138 58 138 88 C138 76 124 70 100 70 C76 70 62 76 62 88 Z" fill="${colour}" opacity="0.85"/>`;
    case 'wavy':
      return cap + `<path d="M60 84 q14 12 26 0 q14 12 28 0 q14 12 26 0" fill="none" stroke="${colour}" stroke-width="7" stroke-linecap="round"/>`;
    case 'curly':
    case 'afro':
      return `<path d="M58 88 C58 54 78 40 100 40 C122 40 142 54 142 88 C138 70 122 62 100 62 C78 62 62 70 58 88 Z" fill="${colour}"/>`;
    default:
      return cap;
  }
}

function facialHairPath(inputs: AvatarInputs, colour: string): string {
  switch (inputs.facialHair) {
    case 'stubble':
      return `<path d="M68 118 C68 148 84 162 100 162 C116 162 132 148 132 118 C132 142 118 152 100 152 C82 152 68 142 68 118 Z" fill="${colour}" opacity="0.28"/>`;
    case 'moustache':
      return `<path d="M86 130 q14 -7 28 0 q-14 7 -28 0 Z" fill="${colour}"/>`;
    case 'goatee':
      return `<path d="M88 128 q12 -6 24 0 q-12 6 -24 0 Z" fill="${colour}"/><path d="M92 143 q8 12 16 0 q-4 14 -16 0 Z" fill="${colour}"/>`;
    case 'beard':
      return `<path d="M66 112 C66 152 84 168 100 168 C116 168 134 152 134 112 C134 146 118 156 100 156 C82 156 66 146 66 112 Z" fill="${colour}"/>` +
        `<path d="M86 129 q14 -7 28 0 q-14 7 -28 0 Z" fill="${colour}"/>`;
    default:
      return '';
  }
}

function accessoryPath(inputs: AvatarInputs): string {
  switch (inputs.accessory) {
    case 'glasses':
      return `<g fill="none" stroke="#3a3a3a" stroke-width="3">` +
        `<circle cx="82" cy="108" r="14"/><circle cx="118" cy="108" r="14"/>` +
        `<path d="M96 108 h8"/><path d="M68 105 l-8 -4"/><path d="M132 105 l8 -4"/></g>`;
    case 'sunglasses':
      return `<g><rect x="66" y="98" width="30" height="20" rx="7" fill="#23282e"/>` +
        `<rect x="104" y="98" width="30" height="20" rx="7" fill="#23282e"/>` +
        `<path d="M96 106 h8" stroke="#23282e" stroke-width="4"/>` +
        `<path d="M66 102 l-8 -3 M134 102 l8 -3" stroke="#23282e" stroke-width="3"/></g>`;
    case 'earrings':
      return `<circle cx="62" cy="118" r="4" fill="#d9b45c"/><circle cx="138" cy="118" r="4" fill="#d9b45c"/>`;
    case 'headphones':
      return `<path d="M58 104 C58 68 76 52 100 52 C124 52 142 68 142 104" fill="none" stroke="#2f3336" stroke-width="7"/>` +
        `<rect x="48" y="98" width="16" height="28" rx="7" fill="#2f3336"/>` +
        `<rect x="136" y="98" width="16" height="28" rx="7" fill="#2f3336"/>`;
    default:
      return '';
  }
}

function mouthPath(inputs: AvatarInputs): string {
  switch (inputs.expression) {
    case 'smile':
      return `<path d="M86 134 q14 12 28 0" fill="none" stroke="#8a4a45" stroke-width="4" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M84 131 q16 18 32 0 Z" fill="#8a4a45"/><path d="M86 132 q14 4 28 0 Z" fill="#ffffff"/>`;
    case 'thoughtful':
      return `<path d="M88 137 q12 -5 24 -1" fill="none" stroke="#8a4a45" stroke-width="4" stroke-linecap="round"/>`;
    default:
      return `<path d="M88 136 h24" fill="none" stroke="#8a4a45" stroke-width="4" stroke-linecap="round"/>`;
  }
}

/** Brows carry more expression than eyes do, so they move with it. */
function browPaths(inputs: AvatarInputs, colour: string): string {
  const lift = inputs.expression === 'thoughtful' ? -4 : 0;
  const stroke = `fill="none" stroke="${colour}" stroke-width="5" stroke-linecap="round"`;
  return `<path d="M70 ${92 + lift} q12 -7 24 -1" ${stroke}/><path d="M106 ${91} q12 -6 24 1" ${stroke}/>`;
}

/**
 * A short stable suffix for this avatar's SVG element ids.
 *
 * Not decoration. SVG ids are global to the document, so two avatars inlined on
 * one page both define `id="bg"` — and every one of them then paints with the
 * FIRST definition. A grid of eight avatars renders eight identical
 * backgrounds, which is exactly what a preview of this renderer did before this
 * existed. Derived from the choices rather than random, so the output stays
 * byte-identical for identical input.
 */
function idSuffix(inputs: AvatarInputs): string {
  const key = inputsKey(inputs);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Draw the portrait. Pure: same inputs in, byte-identical SVG out.
 * 200×200 viewBox, so it scales to a call tile or a 32px chat bubble equally.
 */
export function renderAvatarSvg(inputs: AvatarInputs): string {
  const skin = SKIN[inputs.skinTone];
  const hair = HAIR[inputs.hairColour];
  const eye = EYES[inputs.eyeColour];
  const [bgA, bgB] = BG[inputs.background];
  const uid = idSuffix(inputs);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Avatar portrait">`,
    `<defs><linearGradient id="bg-${uid}" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${bgA}"/><stop offset="100%" stop-color="${bgB}"/>`,
    `</linearGradient><clipPath id="frame-${uid}"><circle cx="100" cy="100" r="100"/></clipPath></defs>`,
    `<g clip-path="url(#frame-${uid})">`,
    `<rect width="200" height="200" fill="url(#bg-${uid})"/>`,
    // shoulders
    `<path d="M40 200 C40 162 68 148 100 148 C132 148 160 162 160 200 Z" fill="${skin.shade}"/>`,
    hairBack(inputs, hair),
    // neck + head
    `<rect x="88" y="130" width="24" height="26" rx="10" fill="${skin.shade}"/>`,
    `<ellipse cx="100" cy="106" rx="40" ry="46" fill="${skin.base}"/>`,
    // ears
    `<ellipse cx="60" cy="110" rx="7" ry="10" fill="${skin.base}"/>`,
    `<ellipse cx="140" cy="110" rx="7" ry="10" fill="${skin.base}"/>`,
    hairFront(inputs, hair),
    browPaths(inputs, hair),
    // eyes
    `<ellipse cx="84" cy="107" rx="6" ry="7" fill="#ffffff"/>`,
    `<ellipse cx="116" cy="107" rx="6" ry="7" fill="#ffffff"/>`,
    `<circle cx="84" cy="108" r="3.6" fill="${eye}"/><circle cx="116" cy="108" r="3.6" fill="${eye}"/>`,
    `<circle cx="85.5" cy="106" r="1.4" fill="#ffffff"/><circle cx="117.5" cy="106" r="1.4" fill="#ffffff"/>`,
    // nose
    `<path d="M100 112 q-5 10 2 12" fill="none" stroke="${skin.shade}" stroke-width="3" stroke-linecap="round"/>`,
    mouthPath(inputs),
    facialHairPath(inputs, hair),
    accessoryPath(inputs),
    `</g></svg>`,
  ].join('');
}
