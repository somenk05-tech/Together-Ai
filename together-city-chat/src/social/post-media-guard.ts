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

/**
 * ── WHAT WE WERE LOOKING AT, AND WHAT DID NOT HAPPEN BECAUSE OF IT ──────────
 *
 * Every refusal this guard writes ends "so the post hasn’t gone up", because
 * until 31 Aug the only caller was `createPost`. `setCover` now screens too,
 * and for that caller the post is already up — the sentence would have been a
 * lie in the one place a citizen is reading it to decide what to do next. So
 * the consequence travels with the subject rather than being baked into the
 * string.
 *
 * `appMade` is the other axis, and it existed before as `isVideo` by accident.
 * "That file isn’t a photo we can read" is actionable when the citizen CHOSE
 * the file, and confusing when the app made it — a composer poster or an
 * ffmpeg frame. It happened to line up with video; it is really about who
 * produced the bytes, and now it says so.
 */
type Subject = { noun: string; consequence: string; appMade: boolean };

const AS_A_POST_PHOTO: Subject = { noun: 'photo', consequence: 'so the post hasn’t gone up', appMade: false };
const AS_A_POST_COVER: Subject = { noun: 'video’s cover image', consequence: 'so the post hasn’t gone up', appMade: true };
const AS_A_NEW_COVER: Subject = { noun: 'cover image', consequence: 'so the cover hasn’t changed', appMade: true };

/**
 * ── EVERY KEY A VIEWER CAN BE SHOWN, NOT ONE CHOSEN BY KIND ─────────────────
 *
 * The first version of this guard read:
 *
 *     const key = isVideo ? (m.thumbUrl ?? '') : m.url;
 *
 * — one key per media item, picked by kind. For a video that is the poster,
 * which is correct and deliberate. For an IMAGE it is `url` and nothing else,
 * and `thumbUrl` is accepted on every media entry regardless of kind
 * (`social.dto.ts`), passes `verifyMedia` (which checks ownership and
 * existence, never content), is stored, is signed, and is the field the
 * profile grid PREFERS for images:
 *
 *     const imgSrc = isVideo ? first?.thumbUrl : (first.thumbUrl || first.url)
 *
 * So: upload a clean JPEG as `url` and anything at all as `thumbUrl`, and the
 * screener reads the clean one while every visitor to the author's grid sees
 * the other. Sixteen tests were written for this guard and not one covered an
 * image's thumbUrl, because they were written from the same belief the code
 * was — that a media item has *a* picture.
 *
 * THE RULE IS NOT "ALSO SCREEN THE THUMBNAIL". It is: screen every key that a
 * viewer can be shown. Written as a set rather than a choice, the next field
 * somebody adds to a media item is either in it or is a deliberate omission
 * with a line explaining itself — which is not what `isVideo ? a : b` offers.
 *
 * The one omission today is a VIDEO'S OWN `url`. Rekognition's synchronous API
 * reads images; screening footage means StartContentModeration — asynchronous,
 * S3-and-SNS, a job with a lifecycle — and until that exists the poster is the
 * honest half. Every other key here is a picture somebody will see.
 */
export function screenableKeys(m: { url: string; kind: string; thumbUrl?: string | null }): string[] {
  const keys = m.kind === 'video' ? [m.thumbUrl] : [m.url, m.thumbUrl];
  return [...new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0))];
}

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
   * WHICH keys are screened is `screenableKeys`, not this method: every key a
   * viewer can be shown, which for an image is both of them. See decision 3
   * for the one deliberate omission.
   */
  async screenPost(
    userId: string,
    media: ReadonlyArray<{ url: string; kind: string; thumbUrl?: string | null }>,
  ): Promise<PostScreening> {
    for (const m of media) {
      const isVideo = m.kind === 'video';
      if (isVideo && !m.thumbUrl) {
        // Nothing to check, and fail-closed means that is a refusal. The
        // composer always generates a poster, so this is a client that did not
        // send one rather than a citizen who could not make one.
        return { ok: false, retryable: false, reason: 'That video could not be checked because it arrived without a cover image. Try posting it again.' };
      }
      const subject = isVideo ? AS_A_POST_COVER : AS_A_POST_PHOTO;
      for (const key of screenableKeys(m)) {
        const out = await this.screenOne(key, userId, subject);
        if (!out.ok) return out;
      }
    }
    return { ok: true };
  }

  /**
   * ── A COVER SET AFTER THE FACT IS STILL A PICTURE THE CITY SEES ─────────────
   *
   * `setCover` extracts a frame with ffmpeg and pins it as the media's
   * thumbUrl. Until 31 Aug it went nowhere near this guard, and the shape of
   * that gap is worse than "one endpoint forgot to call the screener":
   *
   * Decision 3 says video is screened BY ITS POSTER, and that the footage is
   * not screened at all. `setCover` let the author replace the poster — the one
   * frame we do check — with any frame of the footage we do not. The single
   * thing the pipeline looks at was swappable, at will, for something from the
   * single thing it does not look at, after the post was already live and
   * already approved.
   *
   * The frame is screened at the same door and by the same rules as any other
   * picture, and a refusal deletes it exactly as decision 4 says. Only the
   * sentence differs, because only the consequence differs.
   */
  async screenCover(userId: string, key: string): Promise<PostScreening> {
    return this.screenOne(key, userId, AS_A_NEW_COVER);
  }

  /**
   * ── A PICTURE THAT NEVER BECAME AN OBJECT IS STILL A PICTURE ───────────────
   *
   * Everything above screens a KEY: the bytes are in the bucket already,
   * because a presigned PUT put them there, and a refusal deletes the object.
   * Two surfaces in this city never take that route — the city-wide profile
   * photo (`users.service.ts`) and a property listing's photographs
   * (`realestate.service.ts`) are `data:` URLs held in a column. Both were
   * screened by nothing at all, and the avatar is the worst of the two: it
   * renders on every feed row, every comment, every chat header and every
   * search result, which is MORE exposed than a post and had LESS protection —
   * the exact inversion decision 3 at the top of this file exists to refuse.
   *
   * Same sniff, same allowlist, same thresholds, same fail-closed default. The
   * one difference is that there is no object to delete on a refusal, because
   * nothing has been stored yet — the caller only writes the column when this
   * says ok, which is a stronger position than the key path can ever be in.
   */
  async screenInlineImage(userId: string, dataUrl: string, consequence: string): Promise<PostScreening> {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(dataUrl ?? '');
    if (!m) return { ok: false, retryable: false, reason: `That file isn’t a photo we can read, ${consequence}.` };
    const bytes = Buffer.from(m[2], 'base64');
    // THE BYTES DECIDE, NOT THE LABEL — `data:image/jpeg` is a claim the sender
    // typed, and it costs nothing to type `data:image/jpeg` over a PDF.
    const actual = sniffImage(bytes.subarray(0, SNIFF_BYTES));
    if (actual === null) {
      return { ok: false, retryable: false, reason: `That file isn’t a photo we can read, ${consequence}.` };
    }
    if (actual === 'image' || !SCREENABLE.has(actual)) {
      return { ok: false, retryable: false, reason: `A photo has to be a JPEG, PNG or WebP.` };
    }
    if (bytes.length > MAX_SCREEN_BYTES) {
      return { ok: false, retryable: false, reason: `That photo is too large to check — try a smaller one.` };
    }
    if (!this.client) {
      return { ok: false, retryable: true, reason: `We couldn’t check that photo just now, ${consequence}. Try again in a moment.` };
    }
    let labels: Array<{ Name?: string; ParentName?: string; Confidence?: number }>;
    try {
      const res = await this.client.send(new DetectModerationLabelsCommand({
        Image: { Bytes: bytes }, MinConfidence: this.holdAt,
      }));
      labels = res.ModerationLabels ?? [];
    } catch (e) {
      this.logger.warn(`inline image: Rekognition failed (${(e as Error).message})`);
      return { ok: false, retryable: true, reason: `We couldn’t check that photo just now, ${consequence}. Try again in a moment.` };
    }
    const verdict = verdictFor(labels, this.rejectAt);
    if (verdict.status === 'approved') return { ok: true };
    this.logger.warn(`inline image refused (${verdict.status}) from ${userId}: ${verdict.reason}`);
    return { ok: false, retryable: false, reason: `That photo didn’t pass our automated check, ${consequence}.` };
  }

  private async screenOne(key: string, userId: string, subject: Subject): Promise<PostScreening> {
    const { noun, consequence } = subject;

    // THE BYTES DECIDE, NOT THE LABEL. Nothing server-side saw this file at
    // upload — the PUT went straight to the bucket with a Content-Type the
    // client chose — so the declared type is the claim being checked and
    // cannot be what answers.
    const head = await this.storage.getPostObjectPrefix(key, SNIFF_BYTES)
      .catch(swallowed('social: read the first bytes of post media', null, { userId }));
    if (!head) {
      return { ok: false, retryable: true, reason: `We couldn’t read that ${noun} just now, ${consequence}. Try again in a moment.` };
    }

    const actual = sniffImage(head);
    if (actual === null) {
      if (subject.appMade) {
        return this.refuse(key, userId, `We couldn’t read that ${noun}, ${consequence}.`);
      }
      /* A POST'S IMAGE THAT IS NOT AN IMAGE IS REFUSED, WHERE A CHAT'S WOULD
         PASS. ChatMediaGuard returns ok for a non-image because a chat carries
         voice notes and documents that are legitimately out of scope. A post
         carries images and videos and nothing else — the DTO's allowlist says
         so — so a file here that is not a raster image is a file that lied
         about what it is, and there is no third category to fall into. */
      return this.refuse(key, userId, `That file isn’t a photo we can read, ${consequence}.`);
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
      return { ok: false, retryable: true, reason: `We couldn’t check that ${noun} just now, ${consequence}. Try again in a moment.` };
    }

    const obj = await this.storage.getPostObjectBase64(key)
      .catch(swallowed('social: read post media for screening', null, { userId }));
    if (!obj) {
      return { ok: false, retryable: true, reason: `We couldn’t read that ${noun} just now, ${consequence}. Try again in a moment.` };
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
      return { ok: false, retryable: true, reason: `We couldn’t check that ${noun} just now, ${consequence}. Try again in a moment.` };
    }

    const verdict = verdictFor(labels, this.rejectAt);
    if (verdict.status === 'approved') return { ok: true };
    this.logger.warn(`social media refused (${verdict.status}) from ${userId}: ${verdict.reason}`);
    return this.refuse(key, userId, `That ${noun} didn’t pass our automated check, ${consequence}.`);
  }

  /** A refusal that is final, and takes the file with it. See decision 4. */
  private async refuse(key: string, userId: string, reason: string): Promise<PostScreening> {
    await this.storage.deletePrivateObject(key)
      .catch(swallowed('social: delete refused post media', undefined, { userId, key }));
    return { ok: false, retryable: false, reason };
  }
}
