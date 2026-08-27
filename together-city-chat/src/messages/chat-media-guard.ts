import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { StorageProvider } from '../media/storage.provider';
import { swallowed } from '../shared/swallow';
import { verdictFor } from '../dating/photo-moderation.service';

/**
 * ── WHAT A STRANGER MAY PUT IN FRONT OF YOU ─────────────────────────────────
 *
 * Owner, 27 Aug, after the launch audit: chat photos and voice notes are
 * entirely unmoderated — fix it.
 *
 * They were. A dating profile PHOTO went through a full fail-closed
 * Rekognition pipeline before another citizen could see it. A photo sent into
 * a dating CHAT got an ownership check on its URL and nothing else: no scan,
 * no size policy beyond the upload cap, no hold state, no recipient consent,
 * no blur-until-accepted. Either party could send an image the moment a chat
 * opened. That is the most common abuse vector in this category, and it was
 * the one surface here with nothing at all.
 *
 * ── THREE DECISIONS, ALL ARGUABLE, ALL WRITTEN DOWN ─────────────────────────
 *
 * 1 · DATING CONVERSATIONS ONLY. City chat is between people who accepted a
 *     connection with each other; a dating chat is between two strangers a
 *     matching engine introduced. The harm this exists to stop is the
 *     unsolicited image from somebody you do not know, so that is where it
 *     runs. Extending it to every conversation in the city is a bigger
 *     decision about a much larger blast radius, and it is the owner's.
 *
 * 2 · IT REFUSES THE SEND RATHER THAN HOLDING THE IMAGE. The profile pipeline
 *     files a photo as `held` and a moderator looks at it. There is no queue
 *     for message attachments and inventing one would mean a human reading
 *     strangers' private messages to clear it. Refusing at the point of
 *     sending is the honest shape: the sender finds out immediately, from the
 *     only person who can do anything about it, and the recipient is never
 *     shown something that is later taken away.
 *
 *     `held` therefore refuses too. Held means "a person should look at this",
 *     and there is no person — so the uncertain case cannot be waved through.
 *
 * 3 · FAIL-CLOSED, and the message says which kind of no it is. "Did not pass"
 *     and "could not be checked" are different sentences, because the second
 *     one is worth retrying and the first is not. With Rekognition down, no
 *     photograph goes into a dating chat — which is the same trade the profile
 *     pipeline already makes, and the digest now alarms on the queue that
 *     failure produces.
 *
 * ── WHAT THIS DOES NOT DO, SAID PLAINLY ─────────────────────────────────────
 *
 * VOICE NOTES ARE NOT SCANNED. Nothing in this stack can classify audio —
 * Rekognition does images — so there is no honest way to screen them here, and
 * pretending otherwise by running them past an image classifier would be
 * theatre. They travel as before. If they should not travel at all in a dating
 * chat until there is something to check them with, that is a switch to add,
 * not a gap to paper over.
 *
 * And it does not un-publish anything. Attachments live in the public bucket,
 * so a refused image was already uploaded and is already addressable by anyone
 * holding its URL. What is prevented is DELIVERY — the recipient never learns
 * the URL, which is the part that matters when the recipient is the target.
 */

/** What Rekognition may be handed. Anything else is refused unread — a file
 *  claiming to be an image and arriving as something else is not a case to be
 *  clever about. */
const SCREENABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Enough for every container below. WebP and the ISO-BMFF family need 12. */
const SNIFF_BYTES = 16;

/**
 * ── WHAT THIS FILE ACTUALLY IS, READ FROM THE FILE ─────────────────────────
 *
 * THE HOLE THIS CLOSES, and it was mine. The first version of this guard
 * opened with `if (!mimeType.startsWith('image/')) return { ok: true }` — and
 * `mimeType` arrives in the request body, from the sender, validated as
 * `z.string().min(1)` and never against the bytes. Labelling a JPEG
 * `application/octet-stream` skipped the Rekognition call entirely; the
 * message was delivered and the recipient opened a public URL to an
 * unscreened image. One string defeated the whole fail-closed pipeline.
 *
 * It is the repo's own scar in a new place: a guard is only proven where the
 * DATA has reached, and that guard was placed where the CLAIM reached.
 *
 * So the label is no longer consulted for the decision. Every attachment is
 * sniffed and the bytes decide. Returns the concrete type when it is one
 * Rekognition takes, `'image'` for an image container it does not, and null
 * for anything we do not recognise as a raster image at all.
 *
 * THE HONEST LIMIT: null means "not one of these containers", not "definitely
 * not an image". An exotic format nobody's chat client can display would read
 * as null and pass through as out-of-scope. Every format a phone or browser
 * actually produces is below.
 */
export function sniffImage(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image' | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  // Images Rekognition cannot take. Refused rather than waved through: an
  // animated GIF or a HEIC burst is exactly as capable of being the thing
  // this guard exists to stop.
  if (b.toString('latin1', 0, 3) === 'GIF') return 'image';
  if (b.toString('latin1', 0, 2) === 'BM') return 'image';
  if (b.toString('latin1', 0, 4) === 'II*\u0000' || b.toString('latin1', 0, 4) === 'MM\u0000*') return 'image';
  if (b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12);
    if (['heic', 'heix', 'hevc', 'mif1', 'avif', 'avis'].includes(brand)) return 'image';
  }
  return null;
}
/** Above this we do not fetch the bytes at all. The upload path caps size; this
 *  is the second wall, and it refuses rather than skipping the check. */
const MAX_SCREEN_BYTES = 8 * 1024 * 1024;

export type Screening =
  | { ok: true }
  | { ok: false; retryable: boolean; reason: string };

@Injectable()
export class ChatMediaGuard {
  private readonly logger = new Logger(ChatMediaGuard.name);
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
      // Loud, because the consequence is a feature that stops working rather
      // than a check that quietly stops running.
      this.logger.warn('Rekognition is not configured — no photograph can be sent in a dating chat until it is.');
    }
  }

  /**
   * Screen one attachment about to be delivered into a dating conversation.
   *
   * Returns `ok` for anything that is not an image: a voice note, a document, a
   * thumbnail-less row. Those are out of scope rather than approved, and the
   * docblock above says which is which.
   */
  async screen(url: string, mimeType: string, senderId: string, publicBase: string): Promise<Screening> {
    const key = keyFromUrl(url, publicBase);
    if (!key) {
      // No key means no bytes, and no bytes means no decision. A URL we cannot
      // resolve to an object we hold is refused rather than assumed harmless.
      this.logger.warn(`chat media: could not derive a storage key from an attachment url (sender ${senderId})`);
      return { ok: false, retryable: false, reason: 'That file could not be read, so it has not been sent.' };
    }
    // THE BYTES DECIDE, NOT THE LABEL. `mimeType` is the sender's word for
    // what this is; sniffImage's docblock says what that was worth.
    const head = await this.storage.getPublicObjectPrefix(key, SNIFF_BYTES)
      .catch(swallowed('chat media: read the first bytes of an attachment', null, { senderId }));
    if (!head) {
      return { ok: false, retryable: true, reason: 'We could not read that file just now, so it has not been sent. Try again in a moment.' };
    }
    const actual = sniffImage(head);
    // Not an image → out of scope, and that is a statement about scope rather
    // than a pass. Voice notes come through here; nothing in this stack can
    // classify audio and pretending otherwise would be theatre.
    if (actual === null) {
      if (mimeType.startsWith('image/')) {
        // Claims to be an image, is not one we can read. Corrupt or disguised;
        // either way there is nothing to screen and it fails closed.
        return await this.refuse(key, senderId, `We could not read that image, so it has not been sent.`);
      }
      return { ok: true };
    }
    if (actual === 'image') {
      return await this.refuse(key, senderId, 'We can only send JPEG, PNG or WebP images here.');
    }
    if (!SCREENABLE.has(actual)) {
      return await this.refuse(key, senderId, `We can only send JPEG, PNG or WebP images here — not ${actual}.`);
    }
    if (!this.client) {
      // Retryable, so the object is NOT deleted: the sender will send the same
      // URL again once Rekognition is configured.
      return { ok: false, retryable: true, reason: 'We could not check that image just now, so it has not been sent. Try again in a moment.' };
    }
    const obj = await this.storage.getPublicObjectBase64(key)
      .catch(swallowed('chat media: read the image for screening', null, { senderId }));
    if (!obj) {
      return { ok: false, retryable: true, reason: 'We could not read that image just now, so it has not been sent. Try again in a moment.' };
    }
    const bytes = Buffer.from(obj.base64, 'base64');
    if (bytes.length > MAX_SCREEN_BYTES) {
      return await this.refuse(key, senderId, 'That image is too large to send here.');
    }
    let labels: Array<{ Name?: string; ParentName?: string; Confidence?: number }>;
    try {
      const res = await this.client.send(new DetectModerationLabelsCommand({
        Image: { Bytes: bytes }, MinConfidence: this.holdAt,
      }));
      labels = res.ModerationLabels ?? [];
    } catch (e) {
      this.logger.warn(`chat media: Rekognition failed (${(e as Error).message})`);
      return { ok: false, retryable: true, reason: 'We could not check that image just now, so it has not been sent. Try again in a moment.' };
    }
    // `held` refuses as well as `rejected`: held means a person should look,
    // and for a private message there is no person to look.
    const verdict = verdictFor(labels, this.rejectAt);
    if (verdict.status === 'approved') return { ok: true };
    this.logger.warn(`chat media refused (${verdict.status}) from ${senderId}: ${verdict.reason}`);
    return await this.refuse(key, senderId, 'That image did not pass our automated check, so it has not been sent.');
  }

  /**
   * A refusal that is final, and takes the file with it.
   *
   * REFUSING THE SEND DID NOT UN-PUBLISH ANYTHING. Attachments are PUT into
   * the public bucket by the browser before the message is attempted, so
   * every image this guard turned away stayed permanently addressable to
   * anyone holding its URL — and the sender holds it. The guard stopped
   * delivery and left the thing itself sitting there, which for the image
   * this exists to stop is most of the harm still done.
   *
   * Only on a FINAL refusal. A retryable one — Rekognition unreachable,
   * storage momentarily unreadable — leaves the object alone, because the
   * sender is about to send that same URL again.
   *
   * The delete is best-effort and never changes the answer: an object we
   * could not remove is a tidiness problem, and refusing the send is the
   * safety one. Ownership was already established by
   * `assertAttachmentsAreYoursToSend`, which runs before any of this.
   */
  private async refuse(key: string, senderId: string, reason: string): Promise<Screening> {
    try {
      await this.storage.deleteObject(key);
    } catch (e) {
      this.logger.warn(`chat media: refused ${key} from ${senderId} but could not delete it (${(e as Error).message})`);
    }
    return { ok: false, retryable: false, reason };
  }
}

/**
 * The storage key an attachment URL names.
 *
 * Attachments are `<publicBase>/uploads/<userId>/<uuid>.<ext>` — the same
 * shape the ownership gate matches on. Parsed rather than string-sliced so a
 * query string or a trailing slash cannot produce a key that is nearly right.
 */
export function keyFromUrl(url: string, publicBase: string): string | null {
  const base = (publicBase ?? '').replace(/\/+$/, '');
  let path: string;
  try { path = new URL(url).pathname; } catch { path = url; }
  if (base && !url.startsWith(`${base}/`)) return null;
  const key = path.replace(/^\/+/, '');
  return key.startsWith('uploads/') ? key : null;
}
