/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SocialService } from './social.service';
import { PostMediaGuard } from './post-media-guard';

/**
 * ── A COVER SET LATER IS STILL A PICTURE THE CITY SEES ──────────────────────
 *
 * The 31 Aug audit's third critical. `setCover` extracted a frame with ffmpeg
 * and pinned it as the media's thumbUrl without going anywhere near
 * PostMediaGuard.
 *
 * What makes that a critical rather than a missed call site is decision 3 of
 * the guard: video is screened BY ITS POSTER, and the footage is not screened
 * at all. The poster is therefore the WHOLE of what we check on a video — and
 * this endpoint let the author replace it, whenever they liked, with any frame
 * of the footage we deliberately do not check. After the post was live. After
 * it had been approved. The composer's poster passed a classifier; the
 * replacement passed nothing, and the grid, the feed card and every share card
 * render exactly that field.
 *
 * Two rules asserted here, and the second is the one nobody writes a test for:
 *
 *  · the frame is screened, and every way of not screening it refuses;
 *  · the frame it REPLACES leaves the bucket. Every cover before this change
 *    stayed there forever — invisible to the deletion sweep, which walks
 *    PostMedia rows and only ever sees the current value.
 */

const ME = 'me-0000';
const VIDEO = `social/${ME}/v.mp4`;
const OLD_COVER = `social/${ME}/old.jpg`;
const NEW_COVER = `social/${ME}/new.jpg`;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);

/** A post with one video, whose cover is `cover` (or none at all). */
function rig(over: { cover?: string | null; screening?: any } = {}) {
  const deleted: string[] = [];
  const events: string[] = [];
  const updated: any[] = [];
  const prisma = {
    post: {
      findUnique: async () => ({
        id: 'p1',
        authorId: ME,
        media: [{ id: 'm1', url: VIDEO, kind: 'video', thumbUrl: over.cover === undefined ? OLD_COVER : over.cover }],
      }),
    },
    postMedia: {
      update: async (a: any) => { events.push(`row:${a.data.thumbUrl}`); updated.push(a); return a; },
    },
  } as any;
  const storage = {
    signPostObject: async () => 'https://signed.example/v.mp4',
    putPrivateObject: async () => NEW_COVER,
    deletePrivateObject: async (k: string) => { events.push(`delete:${k}`); deleted.push(k); },
  } as any;
  const svc = new SocialService(
    prisma, {} as never, {} as never, storage, {} as never, {} as never, {} as never, over.screening,
  );
  // ffmpeg is not the subject of this file. What comes back is a real JPEG
  // header so nothing downstream has to pretend.
  (svc as any).extractFrame = async () => JPEG;
  return { svc, deleted, events, updated };
}

/** A guard that answers however the test says, without a bucket or a bill. */
const guardSaying = (out: any) => ({ screenCover: jest.fn(async () => out) }) as any;

describe('a frame pinned after the fact goes through the same door', () => {
  it('screens the extracted frame, by its stored key', async () => {
    const g = guardSaying({ ok: true });
    const { svc, updated } = rig({ screening: g });
    await svc.setCover(ME, 'p1', 3);
    expect(g.screenCover).toHaveBeenCalledWith(ME, NEW_COVER);
    expect(updated[0].data.thumbUrl).toBe(NEW_COVER);
  });

  it('refuses when no screening is configured at all, and keeps the old cover', async () => {
    // Absent is the STRICT case here for the same reason it is in createPost:
    // an optional dependency whose absence silently disables a safety check is
    // how a deployment ends up unscreened and confident.
    const { svc, deleted, updated } = rig({ screening: undefined });
    await expect(svc.setCover(ME, 'p1', 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(updated).toHaveLength(0);
    // The frame we are not going to use does not stay in the bucket.
    expect(deleted).toEqual([NEW_COVER]);
  });

  it('refuses a frame that did not pass, and never pins it', async () => {
    const g = guardSaying({ ok: false, retryable: false, reason: 'nope' });
    const { svc, deleted, updated } = rig({ screening: g });
    await expect(svc.setCover(ME, 'p1', 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(updated).toHaveLength(0);
    // A final refusal deletes the object inside the guard, so this path must
    // NOT delete it a second time.
    expect(deleted).toEqual([]);
  });

  it('answers 503 for "could not check" and 403 for "did not pass"', async () => {
    const down = rig({ screening: guardSaying({ ok: false, retryable: true, reason: 'later' }) });
    await expect(down.svc.setCover(ME, 'p1', 3)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(down.updated).toHaveLength(0);
    // Retryable means we could not check it, so the frame is ours to clean up.
    expect(down.deleted).toEqual([NEW_COVER]);

    const failed = rig({ screening: guardSaying({ ok: false, retryable: false, reason: 'no' }) });
    await expect(failed.svc.setCover(ME, 'p1', 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('leaves the OLD cover in place when the new one is refused', async () => {
    const { svc, deleted } = rig({ screening: guardSaying({ ok: false, retryable: false, reason: 'no' }) });
    await expect(svc.setCover(ME, 'p1', 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleted).not.toContain(OLD_COVER);
  });
});

describe('the cover it replaces leaves the bucket', () => {
  it('deletes the previous frame once the new one is the row’s', async () => {
    const { svc, deleted, events } = rig({ screening: guardSaying({ ok: true }) });
    await svc.setCover(ME, 'p1', 3);
    expect(deleted).toEqual([OLD_COVER]);
    // ORDER IS THE POINT. The row points at the new key before the old one is
    // removed, so a delete that fails leaves a stray object and a working
    // post — never a post whose cover is a key with nothing behind it.
    expect(events).toEqual([`row:${NEW_COVER}`, `delete:${OLD_COVER}`]);
  });

  it('deletes nothing when there was no cover to replace', async () => {
    const { svc, deleted } = rig({ cover: null, screening: guardSaying({ ok: true }) });
    await svc.setCover(ME, 'p1', 3);
    expect(deleted).toEqual([]);
  });

  it('survives a bucket that will not delete — the post still gets its cover', async () => {
    // A leftover object is storage we are paying for. A post pointing at a key
    // with nothing behind it is a broken screen. Only one of those may happen.
    const g = guardSaying({ ok: true });
    const { svc } = rig({ screening: g });
    (svc as any).storage.deletePrivateObject = async () => { throw new Error('bucket down'); };
    await expect(svc.setCover(ME, 'p1', 3)).resolves.toEqual({ ok: true, thumbUrl: NEW_COVER });
  });
});

describe('the refusal tells the truth about what did not happen', () => {
  /**
   * Every sentence in PostMediaGuard used to end "so the post hasn’t gone up",
   * because createPost was the only caller. For setCover the post is already
   * up — and that sentence would be a lie in the one place a citizen reads it
   * to decide what to do next.
   */
  const storage = (bytes: Buffer | null) => ({
    getPostObjectPrefix: async () => bytes,
    getPostObjectBase64: async () => (bytes ? { base64: bytes.toString('base64'), contentType: 'image/jpeg' } : null),
    deletePrivateObject: async () => undefined,
  }) as any;

  it('says the cover has not changed, not that the post has not gone up', async () => {
    const g = new PostMediaGuard(storage(JPEG), { get: () => '' } as any);
    (g as any).client = {
      send: async () => ({ ModerationLabels: [{ Name: 'Explicit Nudity', ParentName: 'Explicit Nudity', Confidence: 99 }] }),
    };
    const out = await g.screenCover(ME, NEW_COVER) as any;
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/cover hasn’t changed/);
    expect(out.reason).not.toMatch(/post hasn’t gone up/);
  });

  it('still says the post has not gone up when it is a post being screened', async () => {
    const g = new PostMediaGuard(storage(JPEG), { get: () => '' } as any);
    (g as any).client = {
      send: async () => ({ ModerationLabels: [{ Name: 'Violence', ParentName: 'Violence', Confidence: 99 }] }),
    };
    const out = await g.screenPost(ME, [{ url: `social/${ME}/a.jpg`, kind: 'image' }]) as any;
    expect(out.reason).toMatch(/post hasn’t gone up/);
  });

  it('does not blame the citizen’s file for a frame the app produced', async () => {
    // "That file isn’t a photo we can read" is actionable when they chose the
    // file, and baffling when ffmpeg made it.
    const g = new PostMediaGuard(storage(Buffer.from('%PDF-1.7 padding padding', 'latin1')), { get: () => '' } as any);
    const cover = await g.screenCover(ME, NEW_COVER) as any;
    expect(cover.reason).not.toMatch(/That file isn’t a photo/);
    expect(cover.reason).toMatch(/cover hasn’t changed/);

    const photo = await g.screenPost(ME, [{ url: `social/${ME}/a.jpg`, kind: 'image' }]) as any;
    expect(photo.reason).toMatch(/That file isn’t a photo/);
  });
});
