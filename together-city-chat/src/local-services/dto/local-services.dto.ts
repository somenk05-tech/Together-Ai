import { z } from 'zod';
import { CATEGORY_KEYS } from '../categories';

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

/** csv of localities. Kept as a string end to end — a listing serves places, and
 *  a place is a name somebody typed, not an entity we have a table for. */
const areasSchema = z.string().trim().max(300).optional();

export const CreateListingSchema = z.object({
  businessName: trimmed(2, 90),
  categoryKey: z.enum(CATEGORY_KEYS as [string, ...string[]]),
  about: z.string().trim().max(1200).optional(),
  city: trimmed(2, 60),
  areas: areasSchema,
  // Stored, never returned to anyone but the owner. The anonymous thread is the
  // channel; a phone number in a public listing is the anonymity walking out.
  phone: z.string().trim().max(20).optional(),
  priceFrom: z.number().int().min(0).max(10_000_000).optional(),
  photoUrls: z.array(z.string().url()).max(6).optional(),
  // Bounded to the real world. A swapped lat/lng pair is the classic bug here
  // and it lands the business in the sea off West Africa; the ranges catch the
  // half of those where the longitude exceeds 90.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().int().min(0).max(500).optional(),
  homeVisit: z.boolean().optional(),
  onlineOk: z.boolean().optional(),
});
export type CreateListingDto = z.infer<typeof CreateListingSchema>;

export const UpdateListingSchema = CreateListingSchema.partial();
export type UpdateListingDto = z.infer<typeof UpdateListingSchema>;

export const BrowseSchema = z.object({
  category: z.string().trim().max(40).optional(),
  // "Near me" — a point and a distance. Both or neither; a radius with no
  // centre is a filter that cannot be applied and should say so rather than
  // silently returning everything.
  near: z.string().trim().max(48).optional(), // "lat,lng"
  withinKm: z.coerce.number().min(0.1).max(200).optional(),
  city: z.string().trim().max(60).optional(),
  area: z.string().trim().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});
export type BrowseDto = z.infer<typeof BrowseSchema>;

export const SendServiceMessageSchema = z.object({
  body: trimmed(1, 4000),
});
export type SendServiceMessageDto = z.infer<typeof SendServiceMessageSchema>;

export const EnquireSchema = z.object({
  message: z.string().trim().max(4000).optional(),
});
export type EnquireDto = z.infer<typeof EnquireSchema>;
