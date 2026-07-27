import { z } from 'zod';
import { PROPERTY_TYPES, LISTING_TYPES, STATUSES, FURNISHINGS, FACINGS, AMENITIES } from '../realestate.constants';

const PhotoSchema = z.object({ url: z.string().min(1), caption: z.string().max(120).optional() });
const FloorPlanSchema = z.object({ label: z.string().min(1).max(60), url: z.string().min(1) });
const MilestoneSchema = z.object({ label: z.string().min(1).max(80), pct: z.number().int().min(0).max(100), note: z.string().max(160).optional() });

export const PostPropertySchema = z.object({
  listingType: z.enum(LISTING_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(STATUSES).default('ready'),
  title: z.string().min(3).max(120),
  city: z.string().min(1).max(60),
  locality: z.string().min(1).max(80),
  priceInr: z.number().int().min(1).max(10_000_000_000),
  areaSqft: z.number().int().min(1).max(1_000_000),
  bedrooms: z.number().int().min(0).max(20).default(0),
  bathrooms: z.number().int().min(0).max(20).default(0),
  furnishing: z.enum(FURNISHINGS).optional(),
  floor: z.number().int().min(0).max(200).optional(),
  totalFloors: z.number().int().min(0).max(200).optional(),
  facing: z.enum(FACINGS).optional(),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
  description: z.string().max(2000).optional(),

  // Photos are optional for now (product decision 2026-07-27) — listings can be
  // posted without photos; the card/detail UIs render a "No photo" placeholder.
  photos: z.array(PhotoSchema).default([]),

  // under-construction only
  projectName: z.string().max(120).optional(),
  developer: z.string().max(120).optional(),
  reraId: z.string().max(60).optional(),
  possessionDate: z.string().max(20).optional(),  // e.g. "Dec 2026"
  progressPct: z.number().int().min(0).max(100).optional(),
  floorPlans: z.array(FloorPlanSchema).max(20).optional(),
  milestones: z.array(MilestoneSchema).max(20).optional(),
}).superRefine((v, ctx) => {
  if (v.status === 'under_construction') {
    if (!v.possessionDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['possessionDate'], message: 'Possession date is required for under-construction listings' });
    if (v.progressPct == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['progressPct'], message: 'Construction progress is required for under-construction listings' });
  }
});
export type PostPropertyDto = z.infer<typeof PostPropertySchema>;

export const ListingQuerySchema = z.object({
  city: z.string().optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxPriceInr: z.coerce.number().int().min(0).optional(),
});
export type ListingQueryDto = z.infer<typeof ListingQuerySchema>;
