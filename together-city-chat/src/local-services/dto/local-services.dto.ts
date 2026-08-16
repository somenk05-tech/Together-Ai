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
  // Validated properly in claimSlug — the shape rules live in slug.ts so the
  // web app and the server cannot disagree about what a valid address is.
  slug: z.string().trim().max(60).optional(),
  // The schema key, and the answers it asked for. Both are re-checked against
  // business-types.ts on the way in — the form is not trusted to have sent
  // only what it was told to ask.
  businessType: z.string().trim().max(40).optional(),
  details: z.record(z.unknown()).optional(),
  phone: z.string().trim().max(20).optional(),
  // Off unless the owner says so. See the migration note: this number was
  // given under a promise that it stays private.
  phonePublic: z.boolean().optional(),
  priceFrom: z.number().int().min(0).max(10_000_000).optional(),
  photoUrls: z.array(z.string().url()).max(6).optional(),
  // Bounded to the real world. A swapped lat/lng pair is the classic bug here
  // and it lands the business in the sea off West Africa; the ranges catch the
  // half of those where the longitude exceeds 90.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().int().min(0).max(500).optional(),
  /**
   * WHEN THEY ARE OPEN — up to seven rows, Monday first, set once.
   *
   * `to` is deliberately NOT required to be after `from`: 18:00–01:00 is a
   * real answer for a kitchen, and a validator that refuses it teaches people
   * to type 23:59 and mean something else. The spill past midnight is handled
   * where it belongs — in hours.ts, by the function that answers "open now".
   *
   * Absent means "not changed". An empty array means "take my hours off the
   * page", which is a thing an owner is allowed to want.
   */
  hours: z.array(z.object({
    day: z.number().int().min(0).max(6),
    open: z.boolean(),
    from: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    to: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  })).max(7).optional(),
});
export type CreateListingDto = z.infer<typeof CreateListingSchema>;

export const UpdateListingSchema = CreateListingSchema.partial();
export type UpdateListingDto = z.infer<typeof UpdateListingSchema>;

export const BrowseSchema = z.object({
  category: z.string().trim().max(40).optional(),
  /**
   * A WHOLE GROUP, which is a filter and not only a heading.
   *
   * `category` is one trade; this is all the trades in one family. Both travel
   * because the screen offers both — the group chips are the first row a
   * citizen sees, and until this existed pressing one narrowed nothing.
   * `category` wins when both arrive: it is the more specific of the two, and
   * a screen that sends a leaf has already sent the group it lives in.
   */
  group: z.string().trim().max(60).optional(),
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

export const SaveRegularSchema = z.object({
  note: z.string().trim().max(200).optional(),
});
export type SaveRegularDto = z.infer<typeof SaveRegularSchema>;

/**
 * An offer runs for days, not forever. `endsOn` defaults to `startsOn`, which
 * makes the common case — "today only" — the shortest thing to say, and makes
 * an offer that outlives its usefulness impossible rather than merely unlikely.
 */
export const PostOfferSchema = z.object({
  title: z.string().trim().min(3).max(90),
  detail: z.string().trim().max(400).optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PostOfferDto = z.infer<typeof PostOfferSchema>;

export const PostReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1200).optional(),
});
export type PostReviewDto = z.infer<typeof PostReviewSchema>;

export const ReplyReviewSchema = z.object({
  reply: z.string().trim().min(1).max(1200),
});
export type ReplyReviewDto = z.infer<typeof ReplyReviewSchema>;

/** A photo to read a menu off. Data URL, same shape the food journal uses. */
export const ScanMenuSchema = z.object({
  image: z.string().min(32).max(9_000_000),
});
export type ScanMenuDto = z.infer<typeof ScanMenuSchema>;

/**
 * The CORRECTED menu. This is what gets stored — never the extraction. Sent
 * whole rather than as a diff, because a menu is a small document and "these
 * are the items now" cannot get out of step with itself the way a patch can.
 */
export const SaveMenuSchema = z.object({
  scanUrl: z.string().url().optional(),
  items: z.array(z.object({
    section: z.string().trim().max(60).optional(),
    name: z.string().trim().min(1).max(90),
    description: z.string().trim().max(140).optional(),
    // null is "ask", and it is not the same as free.
    priceInr: z.number().int().min(0).max(500_000).nullable().optional(),
  })).max(200),
});
export type SaveMenuDto = z.infer<typeof SaveMenuSchema>;

/** Items a citizen picked off a menu and wants to ask about. */
export const SendMenuItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(30),
  note: z.string().trim().max(500).optional(),
});
export type SendMenuItemsDto = z.infer<typeof SendMenuItemsSchema>;

/**
 * WHETHER TO SHOW THIS BUSINESS YOUR NAME. One boolean, and it is required —
 * a "toggle" endpoint that flips whatever is there cannot be made idempotent,
 * and two taps from two devices should land on the state the person chose
 * rather than back where they started.
 */
export const RevealNameSchema = z.object({ reveal: z.boolean() });
export type RevealNameDto = z.infer<typeof RevealNameSchema>;
