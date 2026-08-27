import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { StorageProvider } from '../media/storage.provider';
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
    if (!mimeType.startsWith('image/')) return { ok: true };
    if (!SCREENABLE.has(mimeType)) {
      return { ok: false, retryable: false, reason: `We can only send JPEG, PNG or WebP images here — not ${mimeType}.` };
    }
    if (!this.client) {
      return { ok: false, retryable: true, reason: 'We could not check that image just now, so it has not been sent. Try again in a moment.' };
    }
    const key = keyFromUrl(url, publicBase);
    if (!key) {
      this.logger.warn(`chat media: could not derive a storage key from an attachment url (sender ${senderId})`);
      return { ok: false, retryable: false, reason: 'That image could not be read, so it has not been sent.' };
    }
    const obj = await this.storage.getPublicObjectBase64(key).catch(() => null);
    if (!obj) {
      return { ok: false, retryable: true, reason: 'We could not read that image just now, so it has not been sent. Try again in a moment.' };
    }
    const bytes = Buffer.from(obj.base64, 'base64');
    if (bytes.length > MAX_SCREEN_BYTES) {
      return { ok: false, retryable: false, reason: 'That image is too large to send here.' };
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
    return {
      ok: false, retryable: false,
      reason: 'That image did not pass our automated check, so it has not been sent.',
    };
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
