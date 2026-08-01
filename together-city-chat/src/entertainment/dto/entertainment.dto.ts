import { z } from 'zod';


/** A movie/series saved to the personal Watchlist (data mirrors the TMDB card). */
export const SaveWatchSchema = z.object({
  id: z.number().int().positive(),
  type: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  posterUrl: z.string().url().nullable().optional().default(null),
  rating: z.number().min(0).max(10).nullable().optional().default(null),
  releaseDate: z.string().max(10).nullable().optional().default(null),
  language: z.string().max(40).optional().default(''),
  genres: z.array(z.string().max(40)).max(6).optional().default([]),
  platform: z.string().max(60).nullable().optional().default(null),
});
export type SaveWatchDto = z.infer<typeof SaveWatchSchema>;
