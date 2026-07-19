import { z } from 'zod';

export const MatchKindSchema = z.enum(['romantic', 'platonic']);
export type MatchKind = z.infer<typeof MatchKindSchema>;

/** Create/update the dating profile. Birth details power the astrology-first scoring. */
export const UpsertDatingProfileSchema = z.object({
  gender: z.enum(['male', 'female', 'nonbinary']),
  seeking: z.enum(['male', 'female', 'nonbinary', 'any']),
  bio: z.string().max(600).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  birthPlace: z.string().max(120).optional(),
  interests: z.array(z.string().min(1).max(40)).max(20).optional(),
  extras: z.string().max(2_000_000).optional(), // JSON blob (incl. photos as data URLs)
  visible: z.boolean().optional(),
});
export type UpsertDatingProfileDto = z.infer<typeof UpsertDatingProfileSchema>;

export const MatchesQuerySchema = z.object({
  kind: MatchKindSchema.default('romantic'),
});
export type MatchesQueryDto = z.infer<typeof MatchesQuerySchema>;
