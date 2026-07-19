import { z } from 'zod';

export const RestaurantQuerySchema = z.object({
  cuisine: z.string().optional(),
  vegOnly: z.coerce.boolean().optional(),
});
export type RestaurantQueryDto = z.infer<typeof RestaurantQuerySchema>;

export const DiscoverSchema = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  city: z.string().optional(),
  radiusKm: z.coerce.number().min(1).max(50).optional(),
  cuisine: z.string().optional(),
  maxPriceForTwo: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  openNow: z.coerce.boolean().optional(),
  pureVeg: z.coerce.boolean().optional(),
  vegan: z.coerce.boolean().optional(),
  jain: z.coerce.boolean().optional(),
  outdoor: z.coerce.boolean().optional(),
  pet: z.coerce.boolean().optional(),
  family: z.coerce.boolean().optional(),
  meal: z.string().optional(),
});
export type DiscoverDto = z.infer<typeof DiscoverSchema>;

export const OrderItemSchema = z.object({
  dishId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
});

export const PlaceOrderSchema = z.object({
  mode: z.enum(['delivery', 'dinein']).default('delivery'),
  items: z.array(OrderItemSchema).min(1, 'Add at least one dish'),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type PlaceOrderDto = z.infer<typeof PlaceOrderSchema>;

export const ReserveTableSchema = z.object({
  date: z.string().min(4),          // YYYY-MM-DD
  time: z.string().min(3),          // HH:MM
  partySize: z.number().int().min(1).max(20),
  name: z.string().min(1).max(80),
  notes: z.string().max(240).optional(),
});
export type ReserveTableDto = z.infer<typeof ReserveTableSchema>;
