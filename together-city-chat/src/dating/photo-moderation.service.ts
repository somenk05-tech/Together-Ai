import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { swallow } from '../shared/swallow';
import { AnalyticsService } from '../analytics/analytics.service';
import { DATING_PHOTO_MAX_BYTES as PHOTO_MAX_BYTES, DATING_PHOTO_MIME as PHOTO_MIME } from '../media/media.service';

/**
 * Every dating photo is looked at before another citizen sees it.
 *
 * THE PIPELINE FAILS CLOSED. A photo is served to other people only when a
 * DatingPhotoReview row says `approved`. No row, a pending row, a held row, a
 * Rekognition outage, missing credentials — every one of those reads the
 * same way: not yet. The owner still sees their own photos in the editor,
 * with the status beside each, so "why is my photo not showing" has an
 * answer on the page.
 *
 * Rekognition is sent the BYTES, not an S3 pointer, because the vault is an
 * S3-compatible bucket (R2 by default) that Rekognition cannot read from.
 * That caps a dating photo at 5 MB, which is Rekognition's limit for bytes
 * and about four times what a phone camera produces after the browser
 * resizes it.
 */
export type PhotoStatus = 'pending' | 'approved' | 'held' | 'rejected';

/** The label families that hold or refuse a dating photo. Everything else
 *  Rekognition can name (alcohol, tobacco, gambling, rude gestures) is a
 *  person's own business on their own profile. */
const HOLD_FAMILIES = ['Explicit', 'Explicit Nudity', 'Non-Explicit Nudity of Intimate parts and Kissing', 'Violence', 'Visually Disturbing', 'Hate Symbols', 'Suggestive'];
const REJECT_FAMILIES = ['Explicit', 'Explicit Nudity', 'Violence', 'Visually Disturbing', 'Hate Symbols'];


/** How long a photo may sit unreviewed before a person is shown it. Longer than
 *  any review takes, short enough that a stopped pipeline surfaces the same
 *  morning it stops. */
const STALE_PENDING_MS = 15 * 60_000;
/** How old a pending row must be before the sweep looks at it again — past the
 *  window in which it is simply still in flight. */
const RETRY_PENDING_MS = 5 * 60_000;

@Injectable()
export class PhotoModerationService implements OnModuleInit {
  private readonly logger = new Logger(PhotoModerationService.name);
  private client: RekognitionClient | null = null;
  private readonly mode: string;
  private readonly holdAt: number;
  private readonly rejectAt: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {
    this.mode = this.config.get<string>('photoModeration.mode') ?? 'rekognition';
    this.holdAt = this.config.get<number>('photoModeration.holdAt') ?? 60;
    this.rejectAt = this.config.get<number>('photoModeration.rejectAt') ?? 90;
  }

  onModuleInit(): void {
    const region = this.config.get<string>('photoModeration.region') ?? '';
    const accessKeyId = this.config.get<string>('photoModeration.accessKeyId') ?? '';
    const secretAccessKey = this.config.get<string>('photoModeration.secretAccessKey') ?? '';
    if (this.mode === 'rekognition' && region && accessKeyId && secretAccessKey) {
      this.client = new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } });
    }
    if (process.env.NODE_ENV === 'production' && this.mode === 'off') {
      // Not a warning. A production process serving unreviewed strangers'
      // photos to strangers is the launch-blocking finding this service exists
      // to close, and a log line nobody reads would reopen it.
      throw new Error('PHOTO_MODERATION=off is not allowed in production.');
    }
    /**
     * OFF BY OMISSION IS STILL OFF (28 Aug, launch audit).
     *
     * The line above refuses the mode somebody CHOOSES. Three env vars away sat
     * the same state reached by forgetting, and it answered with one
     * `logger.warn`: no client, so `review()` returns `pending` on its second
     * line, `approvedOf` admits only `approved`, and every card in the hub is a
     * coloured letter. Forever — nothing retried, and `queue()` reads `held`,
     * so the backlog could not be seen from the console either. Meanwhile each
     * citizen's own editor shows their photos perfectly, so everybody believes
     * their pictures are up.
     *
     * That is not a degraded hub, it is a different product, and it is exactly
     * what an operator gets by following a runbook that never names these
     * variables. So it is fatal for the same reason `off` is: the failure has
     * to reach somebody who can fix it, and a log line does not.
     *
     * Development keeps the warning: a laptop with no AWS account should still
     * boot, and the sentence says plainly what will not work.
     */
    if (!this.configured) {
      const missing = [
        !region && 'REKOGNITION_REGION',
        !accessKeyId && 'REKOGNITION_ACCESS_KEY_ID',
        !secretAccessKey && 'REKOGNITION_SECRET_ACCESS_KEY',
      ].filter(Boolean).join(', ');
      const said = `Photo review is not configured (${missing || `PHOTO_MODERATION=${this.mode}`}). `
        + 'No matchmaking photo can be shown to anybody until it is.';
      if (process.env.NODE_ENV === 'production') throw new Error(said);
      this.logger.warn(said);
    }
  }

  /** True when a photo can be looked at right now (or is being waved through in development). */
  get configured(): boolean {
    return this.mode === 'off' || this.client !== null;
  }

  /**
   * File the keys a citizen just saved and review the ones nobody has looked
   * at. Best-effort and off the request path — the save returns first; the
   * photos appear to other people when the verdict lands.
   */
  async fileAndReview(userId: string, entries: readonly string[]): Promise<void> {
    const own = entries.filter((e) => e.startsWith('data:') || StorageProvider.isOwnDatingKey(userId, e));
    if (!own.length) return;
    const ids = own.map(reviewId);
    const existing = await this.reviewRows(own);
    const fresh = ids.filter((id) => !existing.has(id));
    if (fresh.length) {
      await this.prisma.datingPhotoReview.createMany({ data: fresh.map((key) => ({ key, userId })), skipDuplicates: true });
    }
    for (const entry of own) {
      if ((existing.get(reviewId(entry)) ?? 'pending') !== 'pending') continue;
      await swallow(this.review(entry, userId), 'dating: photo review', { userId, key: reviewId(entry) });
    }
  }

  /** The subset of these keys another citizen may be shown. */
  async approvedOf(keys: readonly string[]): Promise<Set<string>> {
    const rows = await this.reviewRows(keys);
    const out = new Set<string>();
    for (const k of keys) if (rows.get(reviewId(k)) === 'approved') out.add(k);
    return out;
  }

  /** Every key's status, for the owner's own editor. Absent = pending. */
  async statusOf(keys: readonly string[]): Promise<Record<string, PhotoStatus>> {
    const rows = await this.reviewRows(keys);
    const out: Record<string, PhotoStatus> = {};
    for (const k of keys) {
      if (k.startsWith('http')) continue;
      out[k.startsWith('data:') ? reviewId(k) : k] = rows.get(reviewId(k)) ?? 'pending';
    }
    return out;
  }

  /**
   * THE REVIEW TABLE, INCLUDING THE COLUMN THIS CHECKOUT'S CLIENT HAS NOT SEEN.
   *
   * `etag` is in schema.prisma and in a migration; the generated client in this
   * working tree predates both, because `prisma generate` needs to reach
   * binaries.prisma.sh and this machine could not. Every deployment regenerates
   * before it builds, so the types are right where it matters and wrong only
   * here — and three dating suites will not compile while they are wrong.
   *
   * The same escape hatch dating.service.ts already uses for compatibilityScore,
   * kept to one accessor so there is one thing to delete. DELETE IT after any
   * `npx prisma generate`: put `this.prisma.datingPhotoReview` back at the four
   * call sites and this comment with it. It is a stale toolchain, not a design.
   */
  private get reviews() {
    return this.prisma.datingPhotoReview as unknown as {
      findUnique(a: { where: { key: string }; select: { etag: true } }): Promise<{ etag: string | null } | null>;
      update(a: { where: { key: string }; data: Record<string, unknown> }): Promise<unknown>;
      upsert(a: { where: { key: string }; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<unknown>;
    };
  }

  /** Keyed by review id — the vault key, or the digest of an inline photo. */
  private async reviewRows(entries: readonly string[]): Promise<Map<string, PhotoStatus>> {
    const ids = entries.filter((e) => e && !e.startsWith('http')).map(reviewId);
    if (!ids.length) return new Map();
    // unbounded: bounded by `ids`, which is at most ten keys per profile times the page — a review row per key asked for
    const rows = await this.prisma.datingPhotoReview.findMany({ where: { key: { in: ids } }, select: { key: true, status: true } });
    return new Map(rows.map((r) => [r.key, r.status as PhotoStatus]));
  }

  /** Look at one photo and record the verdict. Anything that stops the look leaves it pending. */
  async review(entry: string, userId: string): Promise<PhotoStatus> {
    const key = reviewId(entry);
    if (this.mode === 'off') return this.record(key, userId, 'approved', '', 'PHOTO_MODERATION=off');
    if (!this.client) return 'pending';
    const obj = await this.bytesOf(entry);
    if (obj === 'unreadable') return 'pending';
    /**
     * The identity of the bytes this verdict is about — FROM THE SAME GET
     * THAT READ THEM (fifth audit, 31 Aug, medium 4). This was a separate
     * HEAD after the read: a PUT through a still-valid presign, landed in
     * that gap, got benign bytes reviewed and the hostile bytes' etag
     * recorded — an approval of the swap. And a failed HEAD recorded null,
     * which turned the serve-path check off for that key for ever. Inline
     * photos keep null (there is no object to swap); a vault read that
     * somehow carries no etag stays `pending` rather than un-checkable.
     */
    const etag = obj.etag;
    if (obj.bytes.length > PHOTO_MAX_BYTES) return this.record(key, userId, 'rejected', '', `Larger than ${PHOTO_MAX_BYTES} bytes.`, etag);
    if (!PHOTO_MIME[obj.contentType]) return this.record(key, userId, 'rejected', '', `Not a photo (${obj.contentType}).`, etag);
    if (!entry.startsWith('data:') && !etag) return 'pending';
    let labels: Array<{ Name?: string; ParentName?: string; Confidence?: number }>;
    try {
      const res = await this.client.send(new DetectModerationLabelsCommand({
        Image: { Bytes: obj.bytes },
        MinConfidence: this.holdAt,
      }));
      labels = res.ModerationLabels ?? [];
    } catch (e) {
      this.logger.warn(`Rekognition failed for ${key}: ${(e as Error).message}`);
      return 'pending';
    }
    const verdict = verdictFor(labels, this.rejectAt);
    const summary = labels.slice(0, 5).map((l) => `${l.Name ?? '?'}:${Math.round(l.Confidence ?? 0)}`).join(' · ');
    if (verdict.status === 'held') this.analytics.track('dating.photo.held', userId);
    if (verdict.status === 'rejected') this.analytics.track('dating.photo.rejected', userId);
    return this.record(key, userId, verdict.status, summary, verdict.reason, etag);
  }

  /**
   * THE BYTES BEHIND AN APPROVAL, AND WHAT TO DO WHEN THEY ARE NOT THE ONES.
   *
   * Called on the serve path with the ETag of the object actually being read.
   * A recorded etag that does not match means the photograph was replaced after
   * it was looked at — the one thing a per-key verdict could never notice. The
   * row goes back to `pending`, which takes it off every card immediately (only
   * `approved` is shown) and puts it in front of the machine again, and the
   * caller refuses this request.
   *
   * A NULL recorded etag is allowed through. Those rows were reviewed before
   * the column existed; their upload windows expired long ago, so there is
   * nothing left to swap, and refusing them would take every photograph in the
   * hub off the screen to close a door that is already shut.
   */
  async bytesStillReviewed(key: string, servedETag: string | null | undefined): Promise<boolean> {
    if (key.startsWith('inline/')) return true;
    const row = await this.reviews.findUnique({ where: { key }, select: { etag: true } });
    const recorded = row?.etag ?? null;
    if (!recorded || !servedETag) return true;
    if (recorded === servedETag) return true;
    this.logger.warn(`photo bytes changed after review: ${key} — back to pending`);
    await swallow(this.reviews.update({
      where: { key },
      data: { status: 'pending', reason: 'The photograph changed after it was reviewed.', etag: null },
    }), 'dating: photo re-review after swap', { key });
    return false;
  }

  /** A moderator's decision on a held photo. */
  async decide(key: string, status: 'approved' | 'rejected', actor: string, reason: string): Promise<void> {
    await this.prisma.datingPhotoReview.update({ where: { key }, data: { status, reason: `${actor}: ${reason}`.slice(0, 500), checkedAt: new Date() } });
    if (status === 'rejected' && !key.startsWith('inline/')) await swallow(this.storage.deleteHealthObject(key), 'dating: delete rejected photo', { key });
  }

  /**
   * The photos a person needs to look at, oldest first.
   *
   * `held` is the verdict that asks for a human. `pending` is not a verdict at
   * all — it is what a photo says while the machine has not spoken, and it is
   * the state EVERY photo is in when the machine cannot speak. That made the
   * one screen a moderator would open to check on photo review the one screen
   * that could not show photo review had stopped.
   *
   * So a pending row that has been waiting longer than any review takes joins
   * the queue. The grace period is what keeps ordinary in-flight work out of a
   * human's list: `fileAndReview` is best-effort and off the request path, so a
   * photo is legitimately pending for seconds after a save.
   */
  async queue(limit = 50, staleAfterMs = STALE_PENDING_MS) {
    const stale = new Date(Date.now() - staleAfterMs);
    return this.prisma.datingPhotoReview.findMany({
      where: { OR: [{ status: 'held' }, { status: 'pending', createdAt: { lt: stale } }] },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * LOOK AGAIN AT WHAT NOBODY LOOKED AT.
   *
   * Every path to `pending` is a failure that might not repeat: no client yet,
   * an unreadable object, a Rekognition throw. None of them was ever retried —
   * the only cure was a moderator finding the manual backfill button, on a
   * console they could not reach without a second undocumented env var. So a
   * transient error at upload time made that photograph invisible for good.
   *
   * Bounded and oldest-first, so a genuinely broken dependency costs a fixed
   * handful of calls every sweep rather than a storm. Inline photos are skipped:
   * their review id is a digest of bytes that are no longer addressable.
   */
  async retryPending(limit = 25, olderThanMs = RETRY_PENDING_MS): Promise<number> {
    if (!this.client) return 0;
    const stale = new Date(Date.now() - olderThanMs);
    // unbounded: `take` is the limit argument — a fixed handful per sweep
    const rows = await this.prisma.datingPhotoReview.findMany({
      where: { status: 'pending', createdAt: { lt: stale }, NOT: { key: { startsWith: 'inline/' } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { key: true, userId: true },
    });
    let looked = 0;
    for (const row of rows) {
      await swallow(this.review(row.key, row.userId), 'dating: retry photo review', { key: row.key });
      looked += 1;
    }
    if (looked) this.logger.log(`Re-reviewed ${looked} photo(s) that had been waiting.`);
    return looked;
  }

  /**
   * The photo's bytes, from the vault or from a legacy inline entry. Inline
   * photos predate the vault and still render (photo-storage.spec.ts); they
   * are reviewed from the same bytes, keyed by digest, rather than exempted.
   */
  private async bytesOf(entry: string): Promise<{ bytes: Buffer; contentType: string; etag: string | null } | 'unreadable'> {
    if (entry.startsWith('data:')) {
      const m = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(entry);
      if (!m) return { bytes: Buffer.alloc(0), contentType: 'invalid', etag: null };
      return { bytes: Buffer.from(m[2], 'base64'), contentType: m[1], etag: null };
    }
    const size = await this.storage.healthObjectSize(entry);
    if (size == null) return 'unreadable';
    if (size > PHOTO_MAX_BYTES) return { bytes: Buffer.alloc(size), contentType: 'image/jpeg', etag: null };
    const obj = await this.storage.getHealthObjectBase64(entry);
    if (!obj) return 'unreadable';
    // The etag of exactly the bytes read above — from the same GET, so a PUT
    // that lands between a read and a later HEAD can no longer marry an
    // approval of benign bytes to the identity of hostile ones (medium 4).
    return { bytes: Buffer.from(obj.base64, 'base64'), contentType: obj.contentType, etag: obj.etag ?? null };
  }

  /**
   * `etag` is what makes the verdict about the PHOTOGRAPH rather than about the
   * key. Recorded on every verdict; compared when the image is served. Null for
   * an inline photo (there is no object to swap) and null when the head failed,
   * which grandfathers rather than refuses — see openPhoto for why that is the
   * right way round. (Fourth audit, 28 Aug.)
   */
  private async record(key: string, userId: string, status: PhotoStatus, labels: string, reason: string, etag?: string | null): Promise<PhotoStatus> {
    const bytes = etag ?? null;
    await this.reviews.upsert({
      where: { key },
      update: { status, labels, reason, checkedAt: new Date(), ...(bytes ? { etag: bytes } : {}) },
      create: { key, userId, status, labels, reason, checkedAt: new Date(), etag: bytes },
    });
    if (status === 'rejected' && !key.startsWith('inline/')) await swallow(this.storage.deleteHealthObject(key), 'dating: delete rejected photo', { key });
    return status;
  }
}

/** Pure, so the thresholds can be tested without a client. */
export function verdictFor(
  labels: ReadonlyArray<{ Name?: string; ParentName?: string; Confidence?: number }>,
  rejectAt: number,
): { status: PhotoStatus; reason: string } {
  const family = (l: { Name?: string; ParentName?: string }) => l.ParentName || l.Name || '';
  const hit = labels.filter((l) => HOLD_FAMILIES.includes(family(l)) || HOLD_FAMILIES.includes(l.Name ?? ''));
  if (!hit.length) return { status: 'approved', reason: '' };
  const worst = hit.reduce((a, b) => ((b.Confidence ?? 0) > (a.Confidence ?? 0) ? b : a));
  const reject = hit.some((l) => (l.Confidence ?? 0) >= rejectAt && (REJECT_FAMILIES.includes(family(l)) || REJECT_FAMILIES.includes(l.Name ?? '')));
  if (reject) return { status: 'rejected', reason: `${worst.Name} at ${Math.round(worst.Confidence ?? 0)}%.` };
  return { status: 'held', reason: `${worst.Name} at ${Math.round(worst.Confidence ?? 0)}% — a person decides.` };
}

/**
 * What a review row is keyed by. A vault key is its own id; a legacy inline
 * photo is identified by the digest of its bytes, so the same picture saved
 * twice is one verdict and the row never has to hold the picture.
 */
export function reviewId(entry: string): string {
  if (!entry.startsWith('data:')) return entry;
  return `inline/${createHash('sha256').update(entry).digest('hex').slice(0, 40)}`;
}
