import { z } from 'zod';
import {
  ACCESSORIES, BACKGROUNDS, EXPRESSIONS, EYE_COLOURS, FACIAL_HAIR,
  HAIR_COLOURS, HAIR_STYLES, SKIN_TONES,
} from '../avatar-inputs';

/**
 * Enums all the way down, and `.strict()` so an unknown key is a 400 rather
 * than a silently ignored attempt to smuggle in free text. There is no string
 * field here on purpose — see the note at the top of avatar-inputs.ts.
 */
export const CreateAvatarSchema = z
  .object({
    skinTone: z.enum(SKIN_TONES).optional(),
    hairStyle: z.enum(HAIR_STYLES).optional(),
    hairColour: z.enum(HAIR_COLOURS).optional(),
    eyeColour: z.enum(EYE_COLOURS).optional(),
    facialHair: z.enum(FACIAL_HAIR).optional(),
    accessory: z.enum(ACCESSORIES).optional(),
    expression: z.enum(EXPRESSIONS).optional(),
    background: z.enum(BACKGROUNDS).optional(),
  })
  .strict();

export type CreateAvatarDto = z.infer<typeof CreateAvatarSchema>;
