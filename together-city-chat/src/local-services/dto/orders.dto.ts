import { z } from 'zod';

/**
 * THE ORDER'S OWN VOCABULARY.
 *
 * Everything a citizen sends about an order is here, and everything is
 * re-checked against the LIVE menu on the server — quantities, availability,
 * variant names, add-on names and above all prices. The client computes a
 * total to show; the server computes the total to charge; and `expectInr` is
 * how the two are forced to agree before any money moves — the same guard the
 * till already runs on invoices, for the same reason: somebody looking at
 * ₹720 must not be charged ₹840 because the kitchen repriced the naan while
 * the sheet was open.
 */

/** One line as the citizen picked it. Names, not prices — prices are ours. */
const pickedItem = z.object({
  itemId: z.string().uuid(),
  qty: z.number().int().min(1).max(20),
  /** The variant's NAME as the menu lists it ("Half", "Full"). Optional. */
  variant: z.string().trim().max(40).optional(),
  /** Add-on NAMES as the menu lists them. Deduplicated server-side. */
  addons: z.array(z.string().trim().max(60)).max(6).optional(),
});

export const QuoteOrderSchema = z.object({
  items: z.array(pickedItem).min(1).max(30),
});
export type QuoteOrderDto = z.infer<typeof QuoteOrderSchema>;

export const PlaceOrderSchema = z.object({
  items: z.array(pickedItem).min(1).max(30),
  /** delivery | pickup. Decides which of the fields below are required. */
  fulfilment: z.enum(['delivery', 'pickup']),
  /** The total the citizen was shown. Charged only if it is still true. */
  expectInr: z.number().int().min(1).max(10_00_000),
  note: z.string().trim().max(500).optional(),
  /** Shared with this one business, on this one order. */
  phone: z.string().trim().min(6).max(20),
  /** Delivery only — refused on pickup so nothing is over-shared by habit. */
  address: z.string().trim().min(10).max(400).optional(),
  /** Write the address to the Master Profile too. Their tick, never a default. */
  saveAddress: z.boolean().optional(),
  /** Where they stood when they ordered. Required for delivery. */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type PlaceOrderDto = z.infer<typeof PlaceOrderSchema>;

export const AcceptOrderSchema = z.object({
  /** "About 25 minutes." The kitchen's own estimate, told to the citizen. */
  prepMinutes: z.number().int().min(1).max(600).optional(),
  /**
   * Lines to REMOVE, by snapshot position — agreed in the thread first
   * ("we're out of Coke"). Removal only: an accept can make an order smaller
   * and refund the difference, never larger. A bigger order is a new order.
   */
  removeLines: z.array(z.number().int().min(0).max(29)).max(10).optional(),
  /** "Swapped Coke for Pepsi, same price." The citizen reads this verbatim. */
  adjustmentNote: z.string().trim().max(300).optional(),
});
export type AcceptOrderDto = z.infer<typeof AcceptOrderSchema>;

export const RejectOrderSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type RejectOrderDto = z.infer<typeof RejectOrderSchema>;

/** Forward only, one step at a time. There is no status in a request body. */
export const AdvanceOrderSchema = z.object({
  to: z.enum(['preparing', 'ready', 'completed']),
});
export type AdvanceOrderDto = z.infer<typeof AdvanceOrderSchema>;

export const CancelOrderSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
export type CancelOrderDto = z.infer<typeof CancelOrderSchema>;

/**
 * "Vegetarian, nothing too spicy, ₹800 for two." The brief goes to the model;
 * the MENU the model may pick from is filtered to available, priced items
 * BEFORE the call, and the answer is filtered against the same set AFTER it —
 * the model proposes, the live menu disposes.
 */
export const RecommendSchema = z.object({
  brief: z.string().trim().min(3).max(500),
});
export type RecommendDto = z.infer<typeof RecommendSchema>;

/**
 * THE COMMAND CENTRE'S ONE-TAP EDIT — a partial on one item. Sold out is
 * `available: false`; back on the stove is `available: true`; a price change
 * is `priceInr`. Fields omitted are left exactly as they were.
 */
export const PatchMenuItemSchema = z.object({
  available: z.boolean().optional(),
  priceInr: z.number().int().min(0).max(500_000).nullable().optional(),
  name: z.string().trim().min(1).max(90).optional(),
  description: z.string().trim().max(140).nullable().optional(),
  section: z.string().trim().max(60).nullable().optional(),
  veg: z.enum(['veg', 'nonveg', 'egg']).nullable().optional(),
  spice: z.number().int().min(0).max(3).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  prepMinutes: z.number().int().min(1).max(600).nullable().optional(),
  variants: z.array(z.object({
    name: z.string().trim().min(1).max(40),
    priceInr: z.number().int().min(0).max(500_000),
  })).max(6).nullable().optional(),
  addons: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    priceInr: z.number().int().min(0).max(500_000),
  })).max(12).nullable().optional(),
});
export type PatchMenuItemDto = z.infer<typeof PatchMenuItemSchema>;
