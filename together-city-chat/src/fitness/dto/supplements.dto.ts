import { z } from 'zod';

/**
 * WHAT A CLIENT MAY SAY ABOUT A BAG: which product, and how many. That is the
 * whole vocabulary, and the omission is the design — there is no `priceInr`
 * here to send and therefore none to trust. Beauty's equivalent schema accepts
 * a `name` and a `priceInr` for backward compatibility and then ignores both;
 * this one, written after that lesson rather than before it, never accepted
 * them in the first place.
 *
 * `qty` is bounded at the door as well as in the bag normaliser. Two bounds
 * for one rule is usually a smell — here it is deliberate, because one of them
 * is a 400 that tells the client it asked for something absurd and the other
 * is a silent clamp protecting a JSON column that may have been written by an
 * older build.
 */

export const SupplementBagSchema = z.object({
  lines: z.array(z.object({
    id: z.string().min(1).max(120),
    qty: z.number().int().positive().max(12),
  })).max(30),
});
export type SupplementBagDto = z.infer<typeof SupplementBagSchema>;

export const PlaceSupplementOrderSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(120),
    qty: z.number().int().positive().max(12),
  })).min(1).max(30),
  method: z.enum(['wallet', 'card']).default('wallet'),
  /**
   * THE CONFIRMATION THAT A REFUSAL WAS READ.
   *
   * Twelve products on this shelf sit under supplements the evidence review
   * refuses, and they are buyable — hiding them does not stop the purchase, it
   * only means it happens somewhere that never showed anybody the trials. The
   * screen asks once, in the product's own words, and sends this back.
   *
   * The server checks it rather than trusting the screen to have asked: a
   * client that skips the question gets a 400 naming the products it skipped
   * it for. That is the entire mechanism, and it is worth more than the modal
   * — a confirmation nothing verifies is decoration.
   */
  acknowledged: z.array(z.string().min(1).max(120)).max(30).optional(),
});
export type PlaceSupplementOrderDto = z.infer<typeof PlaceSupplementOrderSchema>;
