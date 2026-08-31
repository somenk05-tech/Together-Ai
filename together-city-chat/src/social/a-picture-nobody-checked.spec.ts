/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SocialService } from './social.service';
import { PostMediaGuard, screenableKeys } from './post-media-guard';
import { CreatePostSchema } from './dto/social.dto';

/**
 * ── A PICTURE NOBODY CHECKED ────────────────────────────────────────────────
 *
 * The last of the 30 Aug audit's five launch blockers: "there is no automated
 * screening on any social upload". The shape of the gap was the inversion that
 * made it a blocker — a dating profile photo passed a fail-closed classifier
 * before ONE person saw it, and a post passed nothing before the WHOLE CITY
 * did.
 *
 * Two halves, and the second is the one a guard like this usually gets wrong.
 *
 *   · That the classifier runs, and that its uncertain verdict refuses.
 *   · That every way of NOT running it also refuses. A screening step is only
 *     worth having if its absence is the strict case: a misconfigured
 *     deployment, an unreadable object, a file that lied about its type, a
 *     video with no cover — each of those is a path where "we did not check
 *     it" must not arrive as "it is fine".
 */

const ME = 'me-0000';
const IMG = `social/${ME}/a.jpg`;

/** A real JPEG header, so the guard's byte sniffing has something true to read. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
/** A GIF: an image container Rekognition cannot take. */
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(10)]);
/** Not a raster image at all. */
const NOT_AN_IMAGE = Buffer.from('%PDF-1.7 and then some padding', 'latin1');

function storageStub(over: { head?: Buffer | null; whole?: string | null } = {}) {
  const deleted: string[] = [];
  return {
    deleted,
    storage: {
      getPostObjectPrefix: async () => (over.head === undefined ? JPEG : over.head),
      getPostObjectBase64: async () => (over.whole === undefined
        ? { base64: JPEG.toString('base64'), contentType: 'image/jpeg' }
        : (over.whole === null ? null : { base64: over.whole, contentType: 'image/jpeg' })),
      deletePrivateObject: async (k: string) => { deleted.push(k); },
    } as any,
  };
}

/** A guard with no Rekognition credentials — the unconfigured deployment. */
const unconfigured = (storage: any) => new PostMediaGuard(storage, { get: () => '' } as any);

/** A guard whose classifier answers with the labels you give it. */
function withLabels(storage: any, labels: any[], throws = false) {
  const g = new PostMediaGuard(storage, { get: () => '' } as any);
  (g as any).client = {
    send: async () => {
      if (throws) throw new Error('rekognition unavailable');
      return { ModerationLabels: labels };
    },
  };
  return g;
}

describe('the classifier decides, and it is allowed to say no', () => {
  it('lets a clean photograph through', async () => {
    const { storage } = storageStub();
    const out = await withLabels(storage, []).screenPost(ME, [{ url: IMG, kind: 'image' }]);
    expect(out.ok).toBe(true);
  });

  it('refuses a rejected photograph, finally, and deletes it', async () => {
    const { storage, deleted } = storageStub();
    const g = withLabels(storage, [{ Name: 'Explicit Nudity', ParentName: 'Explicit Nudity', Confidence: 99 }]);
    const out = await g.screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    expect(out.ok).toBe(false);
    expect(out.retryable).toBe(false);
    // The bytes are in the bucket before we ever see them — that is what a
    // presigned PUT means — so a refusal that only blocks the post leaves the
    // file addressable to anyone holding a signed URL.
    expect(deleted).toEqual([IMG]);
  });

  it('refuses a HELD photograph too, because there is no person to hold it for', async () => {
    // `held` means "a moderator should look at this". The report queue is
    // driven by Report rows, so a held post would reach nobody — which makes
    // waving it through the only other option, and the wrong one.
    const { storage } = storageStub();
    const g = withLabels(storage, [{ Name: 'Suggestive', ParentName: 'Suggestive', Confidence: 70 }]);
    const out = await g.screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    expect(out.ok).toBe(false);
  });

  it('tells "could not check" and "did not pass" apart, in the retry flag and in the words', async () => {
    const { storage } = storageStub();
    const down = await withLabels(storage, [], true).screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    const failed = await withLabels(storage, [{ Name: 'Violence', ParentName: 'Violence', Confidence: 99 }])
      .screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;

    expect(down.retryable).toBe(true);
    expect(down.reason).toMatch(/couldn’t check/i);
    expect(failed.retryable).toBe(false);
    expect(failed.reason).toMatch(/didn’t pass/i);
    // One is worth retrying and the other is not. A citizen told the wrong one
    // either retries forever or abandons a photograph that was fine.
    expect(down.reason).not.toEqual(failed.reason);
  });

  it('does not delete the file when the failure is ours', async () => {
    // Retryable means the citizen will post the same key again. Deleting it
    // would lose their photograph to an operator's missing environment
    // variable.
    const { storage, deleted } = storageStub();
    await withLabels(storage, [], true).screenPost(ME, [{ url: IMG, kind: 'image' }]);
    expect(deleted).toEqual([]);
  });
});

describe('every way of not checking it is also a refusal', () => {
  it('refuses when Rekognition is not configured at all', async () => {
    const { storage } = storageStub();
    const out = await unconfigured(storage).screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    expect(out.ok).toBe(false);
    expect(out.retryable).toBe(true);
  });

  it('refuses a file that claims to be a photo and is not one', async () => {
    // THE HOLE THIS INHERITS THE LESSON FOR. The first version of the chat
    // guard read the CLIENT'S mimeType, so labelling a JPEG
    // application/octet-stream skipped the classifier entirely. Nothing
    // server-side sees a presigned PUT, so the declared type is the claim
    // being checked and cannot be the thing that answers. The bytes decide.
    const { storage, deleted } = storageStub({ head: NOT_AN_IMAGE });
    const out = await withLabels(storage, []).screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    expect(out.ok).toBe(false);
    expect(out.retryable).toBe(false);
    expect(deleted).toEqual([IMG]);
  });

  it('refuses an image container the classifier cannot read', async () => {
    // An animated GIF or a HEIC burst is exactly as capable of being the thing
    // this guard exists to stop.
    const { storage } = storageStub({ head: GIF });
    const out = await withLabels(storage, []).screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/JPEG, PNG or WebP/);
  });

  it('refuses when the object cannot be read at all', async () => {
    const { storage } = storageStub({ head: null });
    const out = await withLabels(storage, []).screenPost(ME, [{ url: IMG, kind: 'image' }]) as any;
    expect(out.ok).toBe(false);
    expect(out.retryable).toBe(true);
  });

  it('refuses a video with no cover image — nothing to check is not a pass', async () => {
    const { storage } = storageStub();
    const out = await withLabels(storage, []).screenPost(ME, [{ url: 'social/me-0000/v.mp4', kind: 'video', thumbUrl: null }]) as any;
    expect(out.ok).toBe(false);
    expect(out.retryable).toBe(false);
  });

  it('screens a video by its COVER, which is the honest half of what it does', async () => {
    // Rekognition's synchronous API reads images, not video. What is checked
    // is the frame the grid and every share card display — a real check on the
    // picture most citizens will ever see of that video, and NOT a check on
    // the footage. The docblock on PostMediaGuard says so; this asserts that
    // it is the poster key the bytes are read from.
    const read: string[] = [];
    const storage = {
      getPostObjectPrefix: async (k: string) => { read.push(k); return JPEG; },
      getPostObjectBase64: async () => ({ base64: JPEG.toString('base64'), contentType: 'image/jpeg' }),
      deletePrivateObject: async () => undefined,
    } as any;
    const out = await withLabels(storage, []).screenPost(ME, [
      { url: 'social/me-0000/v.mp4', kind: 'video', thumbUrl: 'social/me-0000/v.jpg' },
    ]);
    expect(out.ok).toBe(true);
    expect(read).toEqual(['social/me-0000/v.jpg']);
    expect(read).not.toContain('social/me-0000/v.mp4');
  });

  it('stops at the first refusal instead of billing for the rest', async () => {
    let calls = 0;
    const storage = {
      getPostObjectPrefix: async () => { calls++; return NOT_AN_IMAGE; },
      getPostObjectBase64: async () => null,
      deletePrivateObject: async () => undefined,
    } as any;
    await withLabels(storage, []).screenPost(ME, [
      { url: `social/${ME}/1.jpg`, kind: 'image' },
      { url: `social/${ME}/2.jpg`, kind: 'image' },
      { url: `social/${ME}/3.jpg`, kind: 'image' },
    ]);
    expect(calls).toBe(1);
  });
});

/**
 * ── THE FIELD THE GRID SHOWS, AND THE FIELD NOBODY READ ─────────────────────
 *
 * The 31 Aug audit. Sixteen tests above, and not one of them handed an IMAGE a
 * `thumbUrl` — because the guard was written believing a media item has *a*
 * picture, and the tests were written from the same belief. It had two:
 *
 *     const key = isVideo ? (m.thumbUrl ?? '') : m.url;   // the guard
 *     const imgSrc = isVideo ? first?.thumbUrl
 *                            : (first.thumbUrl || first.url);   // the grid
 *
 * The screener read `url`. The profile grid PREFERS `thumbUrl`. So a clean
 * JPEG at `url` and anything at all at `thumbUrl` published a picture nothing
 * had looked at, to everyone who opened the author's profile.
 *
 * Both ends are closed now, and both are asserted here: the DTO refuses a
 * thumbnail on a non-video at the door, and the guard screens EVERY key a
 * viewer can be shown rather than one chosen by kind. Either alone would fix
 * today's hole; the pair is what survives somebody widening the DTO again.
 */
describe('a thumbnail is a picture somebody sees, so a thumbnail is screened', () => {
  const THUMB = `social/${ME}/a-thumb.jpg`;

  it('lists both of an image’s keys, and only the cover for a video', () => {
    expect(screenableKeys({ url: IMG, kind: 'image' })).toEqual([IMG]);
    expect(screenableKeys({ url: IMG, kind: 'image', thumbUrl: THUMB })).toEqual([IMG, THUMB]);
    // The one deliberate omission: a video's own footage. Rekognition's
    // synchronous API reads images, and StartContentModeration is its own
    // piece of work. The poster is the honest half, and it is said out loud.
    expect(screenableKeys({ url: 'social/me-0000/v.mp4', kind: 'video', thumbUrl: THUMB })).toEqual([THUMB]);
  });

  it('does not pay Rekognition twice for one key', () => {
    expect(screenableKeys({ url: IMG, kind: 'image', thumbUrl: IMG })).toEqual([IMG]);
    expect(screenableKeys({ url: IMG, kind: 'image', thumbUrl: null })).toEqual([IMG]);
    expect(screenableKeys({ url: IMG, kind: 'image', thumbUrl: '' })).toEqual([IMG]);
  });

  it('reads an image’s thumbnail, not just its url', async () => {
    const read: string[] = [];
    const storage = {
      getPostObjectPrefix: async (k: string) => { read.push(k); return JPEG; },
      getPostObjectBase64: async () => ({ base64: JPEG.toString('base64'), contentType: 'image/jpeg' }),
      deletePrivateObject: async () => undefined,
    } as any;
    const out = await withLabels(storage, []).screenPost(ME, [{ url: IMG, kind: 'image', thumbUrl: THUMB }]);
    expect(out.ok).toBe(true);
    expect(read).toEqual([IMG, THUMB]);
  });

  it('refuses the post when the CLEAN one is the url and the offending one is the thumbnail', async () => {
    // The exploit exactly: `url` passes, `thumbUrl` is what every visitor to
    // the grid is shown. A guard that reads only the first publishes the
    // second.
    const deleted: string[] = [];
    let last = '';
    const storage = {
      getPostObjectPrefix: async (k: string) => { last = k; return JPEG; },
      getPostObjectBase64: async () => ({ base64: JPEG.toString('base64'), contentType: 'image/jpeg' }),
      deletePrivateObject: async (k: string) => { deleted.push(k); },
    } as any;
    const g = new PostMediaGuard(storage, { get: () => '' } as any);
    (g as any).client = {
      send: async () => ({
        ModerationLabels: last === THUMB
          ? [{ Name: 'Explicit Nudity', ParentName: 'Explicit Nudity', Confidence: 99 }]
          : [],
      }),
    };
    const out = await g.screenPost(ME, [{ url: IMG, kind: 'image', thumbUrl: THUMB }]) as any;
    expect(out.ok).toBe(false);
    expect(out.retryable).toBe(false);
    expect(deleted).toEqual([THUMB]);
  });

  it('refuses an image carrying a cover image at the door, before a row exists', () => {
    // Nothing legitimate is refused: the composer produces a poster only
    // inside its video branch, and the cover picker is video-only. A field no
    // client sends is a field only an attacker sends.
    const bad = CreatePostSchema.safeParse({ text: 'hi', media: [{ url: IMG, kind: 'image', thumbUrl: THUMB }] });
    expect(bad.success).toBe(false);

    const video = CreatePostSchema.safeParse({
      text: 'hi', media: [{ url: `social/${ME}/v.mp4`, kind: 'video', thumbUrl: THUMB }],
    });
    expect(video.success).toBe(true);

    const plain = CreatePostSchema.safeParse({ text: 'hi', media: [{ url: IMG, kind: 'image' }] });
    expect(plain.success).toBe(true);
  });
});

describe('createPost will not publish media it could not have checked', () => {
  const svc = (screening?: any) => {
    const created: any[] = [];
    const prisma = {
      post: {
        create: async (args: any) => {
          created.push(args.data);
          return { ...args.data, id: 'p1', createdAt: new Date(), media: [], author: { id: ME, handle: 'me', name: 'Me' } };
        },
      },
      connection: { findMany: async () => [] },
      follow: { findMany: async () => [] },
    } as any;
    const storage = {
      isOwnPostKey: () => true,
      privateObjectExists: async () => true,
      healthObjectSize: async () => 1024,
      signPostMedia: async () => new Map(),
    } as any;
    const blocking = { blockedWith: async () => new Set<string>() } as any;
    const gateway = { postNew: jest.fn() } as any;
    const notifications = { create: jest.fn(async () => undefined) } as any;
    return {
      created,
      svc: new SocialService(prisma, gateway, notifications, storage, {} as never, blocking, {} as never, screening),
    };
  };
  const withMedia = { text: 'hi', media: [{ url: IMG, kind: 'image' }] } as any;

  /**
   * THE ASSERTION THAT MAKES THE OPTIONAL INJECTION SAFE.
   *
   * The guard is `@Optional()` so a spec need not stand up an image
   * classifier. An optional dependency whose absence silently disables a
   * safety check is how a deployment ends up unscreened and confident — so
   * absent is the STRICT case, not the convenient one.
   */
  it('refuses a post carrying media when no screening was configured', async () => {
    const s = svc(undefined);
    await expect(s.svc.createPost(ME, withMedia)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.created).toHaveLength(0);
  });

  it('publishes a post with NO media even with no screening — most posts', async () => {
    const s = svc(undefined);
    await s.svc.createPost(ME, { text: 'just a thought' } as any);
    expect(s.created).toHaveLength(1);
  });

  it('answers 503 for "could not check" and 403 for "did not pass"', async () => {
    // Nobody reads a status code, which is why the message says it too — but
    // the code is what a client retries on, so it has to be right as well.
    const down = svc({ screenPost: async () => ({ ok: false, retryable: true, reason: 'x' }) });
    await expect(down.svc.createPost(ME, withMedia)).rejects.toBeInstanceOf(ServiceUnavailableException);

    const failed = svc({ screenPost: async () => ({ ok: false, retryable: false, reason: 'y' }) });
    await expect(failed.svc.createPost(ME, withMedia)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publishes when screening approves', async () => {
    const s = svc({ screenPost: async () => ({ ok: true }) });
    await s.svc.createPost(ME, withMedia);
    expect(s.created).toHaveLength(1);
  });
});
