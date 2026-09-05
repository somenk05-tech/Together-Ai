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
        /**
         * ── AN IMAGE MAY CARRY A THUMBNAIL AGAIN, ON PURPOSE ──────────────
         *
         * This refused `thumbUrl` on a non-video, and the reason it gave was
         * "a field no client sends is a field only an attacker sends". That
         * was true when it was written, earlier the same day, and it is not
         * true any more: the composer now uploads a 640px copy of every
         * photograph so the profile grid, the desktop wall and the share
         * tiles stop loading the full 1600px image to fill a small box.
         *
         * REVERSING A LOCK NEEDS THE ARGUMENT THE LOCK WAS FOR. The hole was
         * that the screener read `url` for an image while the grid renders
         * `thumbUrl || url` — so an unscreened picture could be published in
         * a field nothing looked at. That was fixed at the guard in the same
         * commit, and the guard is where it belongs: `screenableKeys` returns
         * EVERY key a viewer can be shown, which for an image is both of
         * them, and `a-picture-nobody-checked.spec.ts` asserts the exploit
         * exactly — clean at `url`, offending at `thumbUrl`, refused, and the
         * thumbnail is the object deleted.
         *
         * So the door-side refusal was the second lock, not the load-bearing
         * one, and it is the one that now costs a feature. Both keys still
         * have to be our own (`mediaRef`), still have to belong to the poster
         * and exist in the bucket (`verifyMedia`), and still have to pass the
         * classifier before the post goes up.
         */
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
  /* `nearby` and `trending` are gone (30 Aug audit). Neither was in the client;
     `trending` sorted by a relation _count over a week of posts, which no index
     can serve and any authenticated request could ask for, and `nearby` meant
     "has a latitude" — no radius, no longitude, no viewer coordinates. An API
     that offers a ranking and a proximity search it does not have is the same
     defect as a screen that invents data. */
  filter: z.enum(['foryou', 'friends', 'following', 'photos', 'videos', 'thoughts']).optional(),
});
export type FeedQueryDto = z.infer<typeof FeedQuerySchema>;

/**
 * ── THE THREE LISTS THAT READ EVERYTHING ────────────────────────────────────
 *
 * shared/paging.ts opens by saying what these caps are and are not: "A ceiling
 * is not the same as pagination, and this is deliberately the cheaper of the
 * two… Real cursor pagination — which these endpoints should eventually have,
 * the way /social/feed and /chat/:id/messages already do — is follow-up work."
 *
 * This is that follow-up work, for the three in Social Life. Comments were
 * capped at RECORD_CAP, which is not a bug so much as a cliff: the 501st
 * comment on a post existed, was counted on the card, and could be reached by
 * nobody. Followers and Following were not capped at all.
 *
 * Same shape as the feed, deliberately — an opaque `cursor` and a clamped
 * `limit` — so there is one paging idiom in the hub rather than three.
 */
export const ListQuerySchema = z.object({
  /* NOT `.uuid()` (4 Sep audit). `followers` has minted `<ms>_<id>` keyset
     cursors since 31 Aug and this schema went on demanding a UUID, so the
     second page of anybody's followers was a 400 — "Show more" failed for
     every citizen with more than thirty. Comments still hand back a bare id,
     which passes too; the reader of each cursor decides what it means. */
  cursor: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListQueryDto = z.infer<typeof ListQuerySchema>;

/** The one-time move of a device's saved-post ids onto the account. */
export const BookmarkSyncSchema = z.object({
  postIds: z.array(z.string().uuid()).max(200),
});
