import { z } from 'zod';

export const SKIN_TYPES = ['dry', 'oily', 'combination', 'normal', 'sensitive'] as const;
export const HAIR_TYPES = ['straight', 'wavy', 'curly', 'coily'] as const;
export const CONCERN_KEYS = ['dryness', 'dullness', 'acne', 'aging', 'pigmentation', 'sensitivity', 'hairLoss'] as const;

export const SaveBeautyProfileSchema = z.object({
  skinType: z.enum(SKIN_TYPES),
  hairType: z.enum(HAIR_TYPES),
  concerns: z.array(z.enum(CONCERN_KEYS)).max(7).default([]),
});
export type SaveBeautyProfileDto = z.infer<typeof SaveBeautyProfileSchema>;

export const PlaceBeautyOrderSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    priceInr: z.number().int().nonnegative(),
    qty: z.number().int().positive().max(20).default(1),
  })).min(1),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type PlaceBeautyOrderDto = z.infer<typeof PlaceBeautyOrderSchema>;
