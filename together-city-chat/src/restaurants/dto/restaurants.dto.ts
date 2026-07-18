import { z } from 'zod';

export const RestaurantQuerySchema = z.object({
  cuisine: z.string().optional(),
  vegOnly: z.coerce.boolean().optional(),
});
export type RestaurantQueryDto = z.infer<typeof RestaurantQuerySchema>;

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
