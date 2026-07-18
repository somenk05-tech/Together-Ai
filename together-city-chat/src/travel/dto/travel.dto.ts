import { z } from 'zod';

export const PackageQuerySchema = z.object({ category: z.string().optional() });
export type PackageQueryDto = z.infer<typeof PackageQuerySchema>;

export const BookPackageSchema = z.object({
  tier: z.string().min(1).max(60),
  pax: z.number().int().min(1).max(20),
  startDate: z.string().max(20).optional(),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type BookPackageDto = z.infer<typeof BookPackageSchema>;

export const FlightSearchSchema = z.object({
  from: z.string().min(3).max(3),
  to: z.string().min(3).max(3),
  date: z.string().min(6).max(20),
  pax: z.coerce.number().int().min(1).max(9).default(1),
  cabin: z.enum(['economy', 'premium', 'business']).default('economy'),
});
export type FlightSearchDto = z.infer<typeof FlightSearchSchema>;

export const BookFlightSchema = z.object({
  from: z.string().min(3).max(3),
  to: z.string().min(3).max(3),
  date: z.string().min(6).max(20),
  cabin: z.enum(['economy', 'premium', 'business']).default('economy'),
  flightId: z.string().min(1).max(60),
  pax: z.number().int().min(1).max(9).default(1),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type BookFlightDto = z.infer<typeof BookFlightSchema>;
