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

/**
 * `name` and `priceInr` are still accepted so an older client keeps working,
 * and are then ignored: the server prices the order from its own catalogue in
 * priceBeautyOrder(). They are deliberately NOT removed from the schema,
 * because rejecting them would break clients while removing them quietly from
 * the type would leave the next reader thinking the old fields still mattered.
 */
export const PlaceBeautyOrderSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(120),
    name: z.string().max(200).optional(),
    priceInr: z.number().int().nonnegative().optional(),
    qty: z.number().int().positive().max(20).default(1),
  })).min(1).max(50),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type PlaceBeautyOrderDto = z.infer<typeof PlaceBeautyOrderSchema>;
