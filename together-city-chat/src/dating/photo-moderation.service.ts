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
    if (process.env.NODE_ENV === 'production' && this.mode === 'off') {
      // Not a warning. A production process serving unreviewed strangers'
      // photos to strangers is the launch-blocking finding this service exists
      // to close, and a log line nobody reads would reopen it.
      throw new Error('PHOTO_MODERATION=off is not allowed in production.');
    }
    if (this.mode === 'rekognition' && region && accessKeyId && secretAccessKey) {
      this.client = new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } });
    } else if (this.mode === 'rekognition') {
      this.logger.warn('Rekognition is not configured — every dating photo stays pending until it is.');
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
    if (obj.bytes.length > PHOTO_MAX_BYTES) return this.record(key, userId, 'rejected', '', `Larger than ${PHOTO_MAX_BYTES} bytes.`);
    if (!PHOTO_MIME[obj.contentType]) return this.record(key, userId, 'rejected', '', `Not a photo (${obj.contentType}).`);
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
    return this.record(key, userId, verdict.status, summary, verdict.reason);
  }

  /** A moderator's decision on a held photo. */
  async decide(key: string, status: 'approved' | 'rejected', actor: string, reason: string): Promise<void> {
    await this.prisma.datingPhotoReview.update({ where: { key }, data: { status, reason: `${actor}: ${reason}`.slice(0, 500), checkedAt: new Date() } });
    if (status === 'rejected' && !key.startsWith('inline/')) await swallow(this.storage.deleteHealthObject(key), 'dating: delete rejected photo', { key });
  }

  /** The photos a person needs to look at, oldest first. */
  async queue(limit = 50) {
    return this.prisma.datingPhotoReview.findMany({ where: { status: 'held' }, orderBy: { createdAt: 'asc' }, take: limit });
  }

  /**
   * The photo's bytes, from the vault or from a legacy inline entry. Inline
   * photos predate the vault and still render (photo-storage.spec.ts); they
   * are reviewed from the same bytes, keyed by digest, rather than exempted.
   */
  private async bytesOf(entry: string): Promise<{ bytes: Buffer; contentType: string } | 'unreadable'> {
    if (entry.startsWith('data:')) {
      const m = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(entry);
      if (!m) return { bytes: Buffer.alloc(0), contentType: 'invalid' };
      return { bytes: Buffer.from(m[2], 'base64'), contentType: m[1] };
    }
    const size = await this.storage.healthObjectSize(entry);
    if (size == null) return 'unreadable';
    if (size > PHOTO_MAX_BYTES) return { bytes: Buffer.alloc(size), contentType: 'image/jpeg' };
    const obj = await this.storage.getHealthObjectBase64(entry);
    if (!obj) return 'unreadable';
    return { bytes: Buffer.from(obj.base64, 'base64'), contentType: obj.contentType };
  }

  private async record(key: string, userId: string, status: PhotoStatus, labels: string, reason: string): Promise<PhotoStatus> {
    await this.prisma.datingPhotoReview.upsert({
      where: { key },
      update: { status, labels, reason, checkedAt: new Date() },
      create: { key, userId, status, labels, reason, checkedAt: new Date() },
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
