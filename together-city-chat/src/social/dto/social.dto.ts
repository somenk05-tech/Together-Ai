import { z } from 'zod';

/** Create a post — text and/or media, optional feeling + geo (for the city map). */
export const CreatePostSchema = z
  .object({
    text: z.string().max(2200).optional(),
    feeling: z.string().max(60).optional(),
    media: z
      .array(
        z.object({
          url: z.string().url(),
          kind: z.enum(['image', 'video']),
          thumbUrl: z.string().url().optional(),
        }),
      )
      .max(10)
      .optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((p) => Boolean(p.text?.trim()) || (p.media?.length ?? 0) > 0, {
    message: 'a post needs text or media',
  });
export type CreatePostDto = z.infer<typeof CreatePostSchema>;

export const CreateCommentSchema = z.object({ text: z.string().min(1).max(1000) });
export type CreateCommentDto = z.infer<typeof CreateCommentSchema>;

export const FeedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type FeedQueryDto = z.infer<typeof FeedQuerySchema>;
