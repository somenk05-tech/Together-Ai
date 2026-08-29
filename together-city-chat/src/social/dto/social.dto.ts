import { z } from 'zod';

/**
 * A POST'S MEDIA IS ONE OF OUR OWN KEYS, AND NOTHING ELSE (30 Aug audit).
 *
 * This accepted `https://` — ANY host — and `data:image/...` up to fifteen
 * MILLION characters, ten per post. Both were mistakes with a bill attached:
 *
 *  · `data:` meant photographs were never uploaded at all. They were stored
 *    inline in Postgres, re-read and re-sent in every feed page (~7 MB for a
 *    page of twenty), uncacheable by any browser or CDN, `loading="lazy"` a
 *    no-op, and broadcast down the websocket to every follower. It also routed
 *    around MediaService entirely, so the one guard written to stop an SVG
 *    reaching a render surface never saw them.
 *  · any-host `https` meant a post could point every viewer's browser at a
 *    server the author chose, and `setCover` would fetch it server-side from
 *    inside the VPC.
 *
 * Now: `social/<userId>/<uuid>.<ext>`, which is what
 * `POST /media/upload-post` hands back, and which SocialService checks against
 * the bucket for ownership, existence and real size before attaching it.
 *
 * The 4096 ceiling is a key length, not a payload — there is no payload here
 * any more.
 */
const mediaRef = z
  .string()
  .max(4096)
  .refine((u) => /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(u), {
    message: 'media must be uploaded first — send the key from /media/upload-post',
  });

/** Create a post — text and/or media, optional feeling + geo (for the city map). */
export const CreatePostSchema = z
  .object({
    text: z.string().max(2200).optional(),
    feeling: z.string().max(60).optional(),
    media: z
      .array(
        z.object({
          url: mediaRef,
          kind: z.enum(['image', 'video']),
          thumbUrl: mediaRef.optional(),
        }),
      )
      .max(10)
      .optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    audience: z.enum(['public', 'friends', 'family', 'private']).optional(),
    category: z.enum(['work', 'personal']).optional(),
    // Attached soundtrack — MUST be a cleared, royalty-free track from the
    // built-in library, served as a relative app path (/music/<file>.mp3).
    // Copyright protection: only these library paths are accepted, so a client
    // can NEVER attach an arbitrary/external (potentially copyrighted) audio
    // URL. Anything else is rejected here at the API boundary.
    musicUrl: z
      .string()
      .max(500)
      .regex(/^\/music\/[\w.-]+\.(mp3|m4a|ogg|wav)$/i, 'only cleared royalty-free library tracks are allowed')
      .optional(),
    musicTitle: z.string().max(120).optional(),
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
  filter: z.enum(['foryou', 'friends', 'nearby', 'trending', 'following', 'photos', 'videos', 'thoughts']).optional(),
});
export type FeedQueryDto = z.infer<typeof FeedQuerySchema>;
