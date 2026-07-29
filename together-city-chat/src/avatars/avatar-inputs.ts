/**
 * What a citizen may choose, and nothing else.
 *
 * Every input here is an enum drawn from a fixed catalogue. That is not a
 * limitation waiting to be lifted — it IS the moderation policy. The open
 * question this feature carried for weeks was "what stops someone generating
 * something vile", and every answer that starts with free-text prompts ends
 * with a classifier that is wrong some of the time on content that has a
 * citizen's face attached to it. A closed catalogue answers it structurally:
 * there is no input that can express something to moderate, so nothing has to
 * be caught after the fact.
 *
 * It also means the same choices produce the same avatar, on any deploy, with
 * or without a model behind it — which is what makes the renderer testable.
 */
export const SKIN_TONES = ['porcelain', 'fair', 'light', 'olive', 'tan', 'brown', 'deep', 'rich'] as const;
export const HAIR_STYLES = ['short', 'buzz', 'wavy', 'curly', 'long', 'bun', 'braids', 'bald', 'afro'] as const;
export const HAIR_COLOURS = ['black', 'darkBrown', 'brown', 'auburn', 'blonde', 'grey', 'white', 'red'] as const;
export const EYE_COLOURS = ['brown', 'darkBrown', 'hazel', 'green', 'blue', 'grey'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'goatee', 'beard'] as const;
export const ACCESSORIES = ['none', 'glasses', 'sunglasses', 'earrings', 'headphones'] as const;
export const EXPRESSIONS = ['calm', 'smile', 'grin', 'thoughtful'] as const;
export const BACKGROUNDS = ['dawn', 'sky', 'forest', 'sand', 'plum', 'slate', 'rose', 'mint'] as const;

export type SkinTone = (typeof SKIN_TONES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColour = (typeof HAIR_COLOURS)[number];
export type EyeColour = (typeof EYE_COLOURS)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Expression = (typeof EXPRESSIONS)[number];
export type Background = (typeof BACKGROUNDS)[number];

export interface AvatarInputs {
  skinTone: SkinTone;
  hairStyle: HairStyle;
  hairColour: HairColour;
  eyeColour: EyeColour;
  facialHair: FacialHair;
  accessory: Accessory;
  expression: Expression;
  background: Background;
}

export const DEFAULT_INPUTS: AvatarInputs = {
  skinTone: 'light',
  hairStyle: 'short',
  hairColour: 'darkBrown',
  eyeColour: 'brown',
  facialHair: 'none',
  accessory: 'none',
  expression: 'calm',
  background: 'sky',
};

const pick = <T extends readonly string[]>(list: T, value: unknown, fallback: T[number]): T[number] =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T[number]) : fallback;

/**
 * Coerce anything into a valid set of choices.
 *
 * Total on purpose. This is called on stored JSON as well as on request bodies,
 * and a row written before a catalogue entry was renamed should render a
 * slightly different avatar rather than throw on read.
 */
export function normaliseInputs(raw: unknown): AvatarInputs {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    skinTone: pick(SKIN_TONES, r.skinTone, DEFAULT_INPUTS.skinTone),
    hairStyle: pick(HAIR_STYLES, r.hairStyle, DEFAULT_INPUTS.hairStyle),
    hairColour: pick(HAIR_COLOURS, r.hairColour, DEFAULT_INPUTS.hairColour),
    eyeColour: pick(EYE_COLOURS, r.eyeColour, DEFAULT_INPUTS.eyeColour),
    facialHair: pick(FACIAL_HAIR, r.facialHair, DEFAULT_INPUTS.facialHair),
    accessory: pick(ACCESSORIES, r.accessory, DEFAULT_INPUTS.accessory),
    expression: pick(EXPRESSIONS, r.expression, DEFAULT_INPUTS.expression),
    background: pick(BACKGROUNDS, r.background, DEFAULT_INPUTS.background),
  };
}

/** The menu the frontend renders. One place, so the two cannot drift. */
export function catalogue() {
  return {
    skinTone: [...SKIN_TONES],
    hairStyle: [...HAIR_STYLES],
    hairColour: [...HAIR_COLOURS],
    eyeColour: [...EYE_COLOURS],
    facialHair: [...FACIAL_HAIR],
    accessory: [...ACCESSORIES],
    expression: [...EXPRESSIONS],
    background: [...BACKGROUNDS],
    defaults: DEFAULT_INPUTS,
  };
}

/**
 * A stable key for one set of choices.
 *
 * Same choices → same key → the same stored asset can be reused instead of
 * re-rendered (and, once a paid model is behind this, not re-billed).
 */
export function inputsKey(inputs: AvatarInputs): string {
  return [
    inputs.skinTone, inputs.hairStyle, inputs.hairColour, inputs.eyeColour,
    inputs.facialHair, inputs.accessory, inputs.expression, inputs.background,
  ].join('|');
}

/**
 * The same choices as a sentence, for a provider that takes a prompt.
 *
 * Unused by the deterministic renderer and deliberately kept anyway: it is the
 * seam a real generation provider plugs into, and writing it here means the
 * catalogue is the only place that has to know what the words are.
 */
export function describeInputs(inputs: AvatarInputs): string {
  const hair = inputs.hairStyle === 'bald' ? 'bald' : `${inputs.hairColour} ${inputs.hairStyle} hair`;
  const face = inputs.facialHair === 'none' ? '' : `, ${inputs.facialHair}`;
  const acc = inputs.accessory === 'none' ? '' : `, wearing ${inputs.accessory}`;
  return `A friendly head-and-shoulders portrait illustration: ${inputs.skinTone} skin, ${hair}, ` +
    `${inputs.eyeColour} eyes${face}${acc}, a ${inputs.expression} expression, on a ${inputs.background} background.`;
}
