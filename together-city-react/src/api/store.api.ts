import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/api/http';

/**
 * THE STORE, ON THE WIRE.
 *
 * OPTIONAL, AND NEVER `.default()` — the same rule the plan and the daybook
 * both learned by breaking: a defaulted field makes zod's INPUT type differ
 * from its OUTPUT type, and `apiGet<T>(url, schema: ZodType<T>)` has one T for
 * both, so the response types as the input side and every screen reading it
 * quietly stops type-checking. `?? []` at the call site, always.
 *
 * `url` AND `image` ARE BACK ON A PRODUCT — owner's store reference, 16 Aug,
 * reversing the 15-Aug drop. The store shows the retailer's photograph and a
 * "see the product" door on every card, the shape the Beauty market has
 * always had: browsing OUT is allowed, PAYING happens here, from the city
 * wallet. The server holds every url to clean https with no affiliate
 * params; `retailer` still travels as provenance in its own right; and the
 * drawn pack stands behind every photograph as the fallback.
 *
 * TWO FIELDS ARE NOT OPTIONAL, AND THEY ARE THE SAFETY ONES. `yours.bucket` is
 * an enum because a refusal that failed to parse would render as an absence,
 * and an absence on a shop page reads as approval. `personalised` is required
 * because it says whether a missing badge means "no opinion" or "we could not
 * reach your health data", and those two must never be allowed to look alike.
 *
 * NOTHING HERE SENDS A PRICE. `usePlaceOrder` posts ids and quantities. The
 * server reads every price off its own shelf — POST /beauty/orders once summed
 * `priceInr` out of the request body, and a ₹1,690 retinal named at ₹1 would
 * have been charged ₹1.
 */

export const YoursSchema = z.object({
  bucket: z.enum(['priority', 'consider', 'optional', 'not-recommended']),
  needsClinician: z.boolean().optional(),
  why: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

export const ProductSchema = z.object({
  id: z.string(),
  supplement: z.string(),
  supplementName: z.string().optional(),
  brand: z.string(),
  name: z.string(),
  strength: z.string().optional(),
  /** The label, with its unit attached — "₹649 / 30 strips". */
  price: z.string().optional(),
  priceFrom: z.number().optional(),
  /** The till price in whole rupees. Absent means it cannot be bought here. */
  priceInr: z.number().optional(),
  sellable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  rx: z.boolean().optional(),
  pack: z.string().optional(),
  colour: z.string().optional(),
  /** The retailer's product page and photograph. Optional on the wire so an
   *  older payload still parses; the pack drawing stands in wherever either
   *  is missing or fails to load. */
  url: z.string().optional(),
  image: z.string().optional(),
  retailer: z.string(),
  grade: z.string().nullable().optional(),
  gradeFor: z.string().nullable().optional(),
  typicalDose: z.string().nullable().optional(),
  upperLimit: z.string().nullable().optional(),
  formToBuy: z.string().nullable().optional(),
  testFirst: z.boolean().optional(),
  yours: YoursSchema.nullable().optional(),
});

export const AisleSchema = z.object({
  id: z.string(),
  title: z.string(),
  blurb: z.string().optional(),
  supplements: z.array(z.string()).optional(),
});

export const StoreSchema = z.object({
  items: z.array(ProductSchema),
  aisles: z.array(AisleSchema).optional(),
  source: z.object({
    title: z.string(), edition: z.string().optional(), reviewed: z.string().optional(),
    assessed: z.number().optional(), note: z.string().optional(),
  }),
  personalised: z.boolean(),
  basis: z.object({
    bloodWork: z.object({ takenOn: z.string().nullable(), granted: z.boolean() }).nullable(),
    medicines: z.number().optional(),
    diet: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
  }).nullable().optional(),
});

/** A bag line as the server priced it. `gone` is a product that has left the
 *  shelf since it went in — shown and marked, never silently deleted. */
export const BagLineSchema = z.object({
  id: z.string(),
  qty: z.number(),
  gone: z.boolean(),
  brand: z.string().optional(),
  name: z.string().optional(),
  price: z.string().optional(),
  priceInr: z.number().optional(),
  pack: z.string().optional(),
  colour: z.string().optional(),
  supplement: z.string().optional(),
  rx: z.boolean().optional(),
  sellable: z.boolean().optional(),
  lineTotalInr: z.number().optional(),
});

export const BagSchema = z.object({
  lines: z.array(BagLineSchema),
  /** Counts only what can actually be charged. */
  totalInr: z.number(),
  unsellable: z.number(),
});

export const OrderSchema = z.object({
  id: z.string(),
  totalInr: z.number(),
  status: z.string(),
  createdAt: z.string(),
  items: z.array(z.object({
    id: z.string(), name: z.string(), brand: z.string().optional(),
    priceInr: z.number(), qty: z.number(),
  })),
});
export const OrdersSchema = z.array(OrderSchema);

export const PlacedSchema = z.object({
  orderId: z.string(),
  orders: OrdersSchema,
  bag: BagSchema,
});

export type Store = z.infer<typeof StoreSchema>;
export type StoreProduct = z.infer<typeof ProductSchema>;
export type Yours = z.infer<typeof YoursSchema>;
export type Bag = z.infer<typeof BagSchema>;
export type BagLine = z.infer<typeof BagLineSchema>;
export type Order = z.infer<typeof OrderSchema>;

export function useStore() {
  return useQuery({ queryKey: ['fitness', 'store'], queryFn: () => apiGet('/fitness/store', StoreSchema) });
}

export function useBag() {
  return useQuery({ queryKey: ['fitness', 'store', 'bag'], queryFn: () => apiGet('/fitness/store/bag', BagSchema) });
}

export function useOrders() {
  return useQuery({ queryKey: ['fitness', 'store', 'orders'], queryFn: () => apiGet('/fitness/store/orders', OrdersSchema) });
}

/**
 * THE BAG IS REPLACED WHOLESALE, never patched. The client owns the arithmetic
 * of adding and removing and the server owns what a bag is allowed to contain,
 * which means there is no "increment" endpoint to race against itself.
 */
export function useSaveBag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: Array<{ id: string; qty: number }>) =>
      apiPut('/fitness/store/bag', { lines }, BagSchema),
    onSuccess: (bag) => { qc.setQueryData(['fitness', 'store', 'bag'], bag); },
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: Array<{ id: string; qty: number }>; acknowledged?: string[] }) =>
      apiPost('/fitness/store/orders', { items: v.items, method: 'wallet', acknowledged: v.acknowledged ?? [] }, PlacedSchema),
    onSuccess: (out) => {
      qc.setQueryData(['fitness', 'store', 'bag'], out.bag);
      qc.setQueryData(['fitness', 'store', 'orders'], out.orders);
      /* The wallet moved. Whatever else on this screen is reading a balance
         is now wrong, and stale money is the one kind of stale nobody
         forgives. */
      void qc.invalidateQueries({ queryKey: ['financial'] });
    },
  });
}

/** Nest serialises a BadRequestException as `{ message }`, sometimes an array
 *  of them. The server's sentence is better than anything this screen could
 *  invent, so it is shown verbatim wherever there is one. */
export function serverSaid(e: unknown): string | null {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  return null;
}
