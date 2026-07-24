import { z } from 'zod';

// Only accept https media URLs. `z.string().url()` alone accepts
// `javascript:...` and `data:text/html,...`, which are stored-XSS/redirect
// vectors if ever rendered into an href/src. Uploaded media is served over
// https (R2/CDN), so this is safe for real content.
const httpsUrl = z
  .string()
  .url()
  .refine((u) => /^https:\/\//i.test(u), { message: 'media URL must be https' });

/** Create a post — text and/or media, optional feeling + geo (for the city map). */
export const CreatePostSchema = z
  .object({
    text: z.string().max(2200).optional(),
    feeling: z.string().max(60).optional(),
    media: z
      .array(
        z.object({
          url: httpsUrl,
          kind: z.enum(['image', 'video']),
          thumbUrl: httpsUrl.optional(),
        }),
      )
      .max(10)
      .optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    audience: z.enum(['public', 'friends', 'family', 'private']).optional(),
    placeName: z.string().max(120).optional(),
    tagged: z.array(z.object({
      id: z.string().min(1), name: z.string().max(80), handle: z.string().max(40),
    })).max(10).optional(),
  })
  .refine((p) => Boolean(p.text?.trim()) || (p.media?.length ?? 0) > 0 || Boolean(p.placeName?.trim()), {
    message: 'a post needs text, media or a check-in location',
  });
export type CreatePostDto = z.infer<typeof CreatePostSchema>;

export const CreateCommentSchema = z.object({ text: z.string().min(1).max(1000) });
export type CreateCommentDto = z.infer<typeof CreateCommentSchema>;

export const FeedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  filter: z.enum(['foryou', 'friends', 'nearby', 'trending', 'following']).optional(),
});
export type FeedQueryDto = z.infer<typeof FeedQuerySchema>;
