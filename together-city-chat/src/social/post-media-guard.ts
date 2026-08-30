import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { StorageProvider } from '../media/storage.provider';
import { swallowed } from '../shared/swallow';
import { verdictFor } from '../dating/photo-moderation.service';
import { sniffImage } from '../messages/chat-media-guard';

/**
 * ── NOTHING SCREENED A POST, ON THE ONE SURFACE THAT REACHES STRANGERS ──────
 *
 * The 30 Aug audit, the last of the five launch blockers: "there is no
 * automated screening on any social upload". `media.service.ts` carried the
 * whole of it as a comment — `// Virus-scan hook: enqueue key for scanning
 * before it is served (stub)`.
 *
 * The distribution of that gap is what makes it the blocker rather than a
 * gap. A dating profile photo goes through a fail-closed Rekognition pipeline
 * before ONE person sees it. A dating chat photo goes through ChatMediaGuard
 * before ONE person sees it. A post on the city feed is seen by EVERY citizen
 * in the city and went through nothing at all. The most exposed surface had
 * the least protection, which is the exact inversion of what the rest of this
 * codebase does.
 *
 * ── WHAT THIS DOES ──────────────────────────────────────────────────────────
 *
 * It screens at the moment of POSTING, not at upload. Upload is a presigned
 * PUT straight to the bucket; nothing server-side sees those bytes. The post
 * is where the object first becomes something other citizens can reach, so it
 * is where the check belongs — and it is also where `verifyMedia` already asks
 * the bucket its three questions, so this is a fourth question in a place that
 * was already asking.
 *
 * ── FOUR DECISIONS, ALL THE OWNER'S, ALL WRITTEN DOWN ───────────────────────
 *
 * 1 · IT REFUSES THE POST RATHER THAN HOLDING IT. `Post.moderation` could
 *     carry a third value and a moderator could look — but the queue is driven
 *     by Report rows, so a held post would reach no one, and inventing a
 *     second queue means a person reading every photograph in the city before
 *     it is published. Refusing at the point of posting is the honest shape:
 *     the citizen finds out immediately, from the only party who can do
 *     anything about it, and nobody is shown something later taken away.
 *
 *     `held` therefore refuses too — held means "a person should look at
 *     this", and there is no person, so the uncertain case cannot be waved
 *     through. Same argument ChatMediaGuard makes, for the same reason.
 *
 * 2 · FAIL-CLOSED, INCLUDING WHEN THE SCANNER IS SIMPLY NOT CONFIGURED.
 *     Owner's call, 30 Aug. With Rekognition unreachable, no photograph is
 *     posted to the city. The consequence is stated loudly at boot rather
 *     than discovered from a support message, and the two refusals are
 *     DIFFERENT SENTENCES: "could not be checked" is worth retrying and "did
 *     not pass" is not. A citizen who is told the wrong one either retries
 *     forever or gives up on a photograph that was fine.
 *
 * 3 · VIDEO IS SCREENED BY ITS POSTER, AND THIS IS SAID OUT LOUD.
 *     Rekognition's synchronous API reads images. Screening video properly
 *     means StartContentModeration — asynchronous, S3-and-SNS, a job with a
 *     lifecycle — which is its own piece of work. What exists today is the
 *     poster frame, which is the image the grid, the feed card and every share
 *     card actually display. Screening it is a real check on the picture most
 *     citizens will ever see of that video, and it is NOT a check on the
 *     footage. Owner's call, 30 Aug, with that limit understood.
 *
 *     A video with no poster is refused. "We could not check this" and "there
 *     was nothing to check" are the same answer when the answer must fail
 *     closed.
 *
 * 4 · A REFUSAL DELETES THE OBJECT. The bytes are already in the bucket by the
 *     time we see them — that is what a presigned PUT means — so a refusal
 *     that only blocks the post leaves the file addressable to anyone who
 *     holds a signed URL for it. It is a private bucket, which narrows that
 *     considerably; it does not close it, and the storage is ours to keep
 *     clean either way.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * It is not a virus scan. The stub it replaces said "virus-scan hook", and
 * this is not that: it is a CONTENT classifier, and it says nothing about
 * whether a file is malicious. The executable-MIME denylist in
 * `media.service.ts` and the four-type allowlist for posts are what stand
 * between a citizen and a file a browser would run; this stands between a
 * citizen and a picture they did not consent to see. Both are needed. Only one
 * of them is here.
 */

/** What Rekognition may be handed. Everything else is refused unread. */
const SCREENABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Enough for every container sniffImage recognises. */
const SNIFF_BYTES = 16;
/** Above this we do not fetch the bytes at all — refuse rather than skip. */
const MAX_SCREEN_BYTES = 12 * 1024 * 1024;

export type PostScreening =
  | { ok: true }
  | { ok: false; retryable: boolean; reason: string };

@Injectable()
export class PostMediaGuard {
  private readonly logger = new Logger(PostMediaGuard.name);
  private readonly client: RekognitionClient | null;
  private readonly holdAt: number;
  private readonly rejectAt: number;

  constructor(private readonly storage: StorageProvider, config: ConfigService) {
    const region = config.get<string>('photoModeration.region') ?? process.env.REKOGNITION_REGION ?? '';
    const id = process.env.REKOGNITION_ACCESS_KEY_ID ?? '';
    const secret = process.env.REKOGNITION_SECRET_ACCESS_KEY ?? '';
    this.holdAt = Number(process.env.PHOTO_MODERATION_HOLD_AT ?? 60);
    this.rejectAt = Number(process.env.PHOTO_MODERATION_REJECT_AT ?? 90);
    this.client = region && id && secret
      ? new RekognitionClient({ region, credentials: { accessKeyId: id, secretAccessKey: secret } })
      : null;
    if (!this.client) {
      /* THE LOUDEST LINE IN THIS FILE, and it is a boot warning rather than a
         runtime one on purpose: the consequence of an unconfigured scanner is
         that a whole feature stops, and the operator should learn that from
         the deploy log at the moment they caused it, not from a citizen. */
      this.logger.warn(
        'Rekognition is not configured — NO photograph or video can be posted to the city feed until it is. '
        + 'Set REKOGNITION_REGION, REKOGNITION_ACCESS_KEY_ID and REKOGNITION_SECRET_ACCESS_KEY.',
      );
    }
  }

  /** Is there a classifier at all? Read by the boot check and by the specs. */
  get configured(): boolean {
    return this.client !== null;
  }

  /**
   * Screen every piece of media on one post. The FIRST refusal wins and the
   * rest are not fetched — a post is all-or-nothing, so there is nothing to
   * learn from screening the other nine attachments of a post that is already
   * refused, and plenty of Rekognition bill to lose.
   *
   * `kind` decides which key is screened: an image screens itself, a video
   * screens its poster. See decision 3.
   */
  async screenPost(
    userId: string,
    media: ReadonlyArray<{ url: string; kind: string; thumbUrl?: string | null }>,
  ): Promise<PostScreening> {
    for (const m of media) {
      const isVideo = m.kind === 'video';
      const key = isVideo ? (m.thumbUrl ?? '') : m.url;
      if (isVideo && !key) {
        // Nothing to check, and fail-closed means that is a refusal. The
        // composer always generates a poster, so this is a client that did not
        // send one rather than a citizen who could not make one.
        return { ok: false, retryable: false, reason: 'That video could not be checked because it arrived without a cover image. Try posting it again.' };
      }
      const out = await this.screenOne(key, userId, isVideo);
      if (!out.ok) return out;
    }
    return { ok: true };
  }

  private async screenOne(key: string, userId: string, isVideo: boolean): Promise<PostScreening> {
    const noun = isVideo ? 'video’s cover image' : 'photo';

    // THE BYTES DECIDE, NOT THE LABEL. Nothing server-side saw this file at
    // upload — the PUT went straight to the bucket with a Content-Type the
    // client chose — so the declared type is the claim being checked and
    // cannot be what answers.
    const head = await this.storage.getPostObjectPrefix(key, SNIFF_BYTES)
      .catch(swallowed('social: read the first bytes of post media', null, { userId }));
    if (!head) {
      return { ok: false, retryable: true, reason: `We couldn’t read that ${noun} just now, so the post hasn’t gone up. Try again in a moment.` };
    }

    const actual = sniffImage(head);
    if (actual === null) {
      if (isVideo) {
        return this.refuse(key, userId, `We couldn’t read that ${noun}, so the post hasn’t gone up.`);
      }
      /* A POST'S IMAGE THAT IS NOT AN IMAGE IS REFUSED, WHERE A CHAT'S WOULD
         PASS. ChatMediaGuard returns ok for a non-image because a chat carries
         voice notes and documents that are legitimately out of scope. A post
         carries images and videos and nothing else — the DTO's allowlist says
         so — so a file here that is not a raster image is a file that lied
         about what it is, and there is no third category to fall into. */
      return this.refuse(key, userId, 'That file isn’t a photo we can read, so the post hasn’t gone up.');
    }
    if (actual === 'image' || !SCREENABLE.has(actual)) {
      // An image container Rekognition cannot take — an animated GIF, a HEIC
      // burst. Refused rather than waved through: it is exactly as capable of
      // being the thing this guard exists to stop.
      return this.refuse(key, userId, `A ${noun} has to be a JPEG, PNG or WebP.`);
    }

    if (!this.client) {
      // RETRYABLE, so the object is NOT deleted: the citizen posts the same
      // key again once the scanner is configured, and nobody loses a
      // photograph to an operator's missing environment variable.
      return { ok: false, retryable: true, reason: `We couldn’t check that ${noun} just now, so the post hasn’t gone up. Try again in a moment.` };
    }

    const obj = await this.storage.getPostObjectBase64(key)
      .catch(swallowed('social: read post media for screening', null, { userId }));
    if (!obj) {
      return { ok: false, retryable: true, reason: `We couldn’t read that ${noun} just now, so the post hasn’t gone up. Try again in a moment.` };
    }
    const bytes = Buffer.from(obj.base64, 'base64');
    if (bytes.length > MAX_SCREEN_BYTES) {
      return this.refuse(key, userId, `That ${noun} is too large to check — try a smaller one.`);
    }

    let labels: Array<{ Name?: string; ParentName?: string; Confidence?: number }>;
    try {
      const res = await this.client.send(new DetectModerationLabelsCommand({
        Image: { Bytes: bytes }, MinConfidence: this.holdAt,
      }));
      labels = res.ModerationLabels ?? [];
    } catch (e) {
      this.logger.warn(`social: Rekognition failed (${(e as Error).message})`);
      return { ok: false, retryable: true, reason: `We couldn’t check that ${noun} just now, so the post hasn’t gone up. Try again in a moment.` };
    }

    const verdict = verdictFor(labels, this.rejectAt);
    if (verdict.status === 'approved') return { ok: true };
    this.logger.warn(`social media refused (${verdict.status}) from ${userId}: ${verdict.reason}`);
    return this.refuse(key, userId, `That ${noun} didn’t pass our automated check, so the post hasn’t gone up.`);
  }

  /** A refusal that is final, and takes the file with it. See decision 4. */
  private async refuse(key: string, userId: string, reason: string): Promise<PostScreening> {
    await this.storage.deletePrivateObject(key)
      .catch(swallowed('social: delete refused post media', undefined, { userId, key }));
    return { ok: false, retryable: false, reason };
  }
}
