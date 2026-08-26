import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Origins allowed to upload directly to the bucket from the browser. Overridable
 *  via MEDIA_CORS_ORIGINS (comma-separated). */
const DEFAULT_CORS_ORIGINS = [
  'https://togethercity.app',
  'https://www.togethercity.app',
  'https://*.togethercity.app',
  'https://*.vercel.app',
  'http://localhost:5173',
];

export interface PresignedUpload {
  uploadUrl: string; // PUT here directly from the client
  publicUrl: string; // final object URL to store on the Attachment
  key: string;
  expiresInSec: number;
}

/**
 * Cloudflare R2 / AWS S3 pre-signed upload provider.
 *
 * R2 is S3-compatible, so the same AWS SDK client works for both: set
 * `S3_ENDPOINT` to your R2 endpoint (https://<accountid>.r2.cloudflarestorage.com),
 * `S3_REGION=auto`, and the R2 access key/secret. When those env vars are absent
 * (dev/demo/test), it falls back to an unsigned deterministic URL so the media
 * flow still runs end-to-end without cloud credentials.
 */
@Injectable()
export class StorageProvider implements OnModuleInit {
  private readonly logger = new Logger(StorageProvider.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly healthBucket: string;
  private readonly publicBase: string;
  private readonly endpoint: string;
  private readonly corsOrigins: string[];
  private readonly expiresInSec = 900;
  private readonly downloadTtlSec = 300; // signed GET links for private health docs

  constructor(private readonly config: ConfigService) {
    const originsCsv = this.config.get<string>('media.corsOrigins') ?? '';
    this.corsOrigins = originsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (!this.corsOrigins.length) this.corsOrigins = DEFAULT_CORS_ORIGINS;
    this.bucket = this.config.get<string>('media.bucket') ?? '';
    /**
     * The private vault: health documents, Drive files and dating photos.
     *
     * THIS FALLBACK IS A DEVELOPMENT CONVENIENCE AND NOTHING MORE. It used to
     * carry the note "health docs are still served ONLY via short-lived signed
     * links (never a stored public URL) either way", which is true of this code
     * and beside the point: the signing discipline protects the LINK, and the
     * fallback moves the OBJECT into a bucket published at
     * MEDIA_PUBLIC_BASE_URL. A signed link to a file anyone can already GET is
     * a lock on an open door.
     *
     * Production can no longer reach this line with an empty private bucket —
     * assertProductionConfig() in shared/config/configuration.ts refuses to
     * boot, in the same block as the JWT secrets and for the same reason.
     */
    this.healthBucket = this.config.get<string>('media.privateBucket') || this.bucket;
    this.publicBase = this.config.get<string>('media.publicBaseUrl') ?? '';
    const endpoint = this.config.get<string>('media.endpoint') ?? '';
    this.endpoint = endpoint;
    const accessKeyId = this.config.get<string>('media.accessKeyId') ?? '';
    const secretAccessKey = this.config.get<string>('media.secretAccessKey') ?? '';
    const region = this.config.get<string>('media.region') ?? 'auto';

    if (endpoint && accessKeyId && secretAccessKey && this.bucket) {
      this.s3 = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // R2 requires path-style addressing
      });
    } else {
      this.s3 = null;
      this.logger.warn(
        'Media storage not fully configured (missing S3_ENDPOINT / keys / MEDIA_BUCKET) — returning unsigned URLs.',
      );
    }
  }

  /** On boot, apply the browser-upload CORS rule to the media + health buckets so
   *  presigned PUTs from the site aren't blocked. Best-effort: requires the R2/S3
   *  token to permit bucket configuration — if it doesn't (403), we log the exact
   *  rule to add manually and uploads still work once it's set in the dashboard. */
  async onModuleInit(): Promise<void> {
    if (!this.s3) return;
    const rule = {
      AllowedOrigins: this.corsOrigins,
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    };
    const buckets = Array.from(new Set([this.bucket, this.healthBucket].filter(Boolean)));
    for (const Bucket of buckets) {
      try {
        await this.s3.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [rule] } }));
        this.logger.log(`R2/S3 CORS applied to bucket "${Bucket}" for: ${this.corsOrigins.join(', ')}`);
      } catch (e) {
        this.logger.warn(
          `Could not auto-apply CORS to bucket "${Bucket}" (${(e as Error).message}). ` +
          `Add this rule to the bucket in Cloudflare R2 → Settings → CORS Policy: ` +
          JSON.stringify([{ AllowedOrigins: this.corsOrigins, AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }]),
        );
      }
    }
  }

  /**
   * Confirm browser uploads will be accepted. `uploadAllowed` is the source of
   * truth: it fires a REAL CORS preflight (OPTIONS + Origin + PUT) at the bucket
   * — exactly what the browser does — so it works even when the token can't read
   * bucket config. `configReadable`/`origins` come from GetBucketCors when the
   * token permits it (nice-to-have, not required).
   */
  async corsStatus(): Promise<{ configured: boolean; site: string; buckets: Array<Record<string, unknown>> }> {
    const site = this.corsOrigins.find((o) => o.includes('togethercity.app')) ?? 'https://togethercity.app';
    if (!this.s3) return { configured: false, site, buckets: [] };
    const names = Array.from(new Set([this.bucket, this.healthBucket].filter(Boolean)));
    const buckets: Array<Record<string, unknown>> = [];
    for (const bucket of names) {
      // 1) The definitive check — a browser-style preflight.
      let uploadAllowed = false; let allowOrigin: string | null = null; let preflightError: string | undefined;
      try {
        const res = await fetch(`${this.endpoint}/${bucket}/cors-preflight-probe`, {
          method: 'OPTIONS',
          headers: { Origin: site, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
        });
        allowOrigin = res.headers.get('access-control-allow-origin');
        uploadAllowed = allowOrigin === '*' || allowOrigin === site;
      } catch (e) { preflightError = (e as Error).message; }

      // 2) Best-effort config read (only if the token is allowed to).
      let configReadable = false; let origins: string[] = []; let methods: string[] = [];
      try {
        const cors = await this.s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
        const rules = cors.CORSRules ?? [];
        origins = Array.from(new Set(rules.flatMap((r) => r.AllowedOrigins ?? [])));
        methods = Array.from(new Set(rules.flatMap((r) => r.AllowedMethods ?? [])));
        configReadable = true;
      } catch { /* token can't read bucket config — fine, preflight is authoritative */ }

      buckets.push({ bucket, uploadAllowed, allowOrigin, configReadable, origins, methods, ...(preflightError ? { preflightError } : {}) });
    }
    return { configured: true, site, buckets };
  }

  async presignUpload(userId: string, mimeType: string, ext: string): Promise<PresignedUpload> {
    const key = `uploads/${userId}/${randomUUID()}.${ext}`;

    if (!this.s3) {
      // Unconfigured fallback — keeps dev/demo working without cloud creds.
      return {
        uploadUrl: `${this.publicBase}/__presigned__/${key}`,
        publicUrl: `${this.publicBase}/${key}`,
        key,
        expiresInSec: this.expiresInSec,
      };
    }

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );

    return {
      uploadUrl,
      publicUrl: `${this.publicBase}/${key}`,
      key,
      expiresInSec: this.expiresInSec,
    };
  }

  get configured(): boolean { return this.s3 !== null; }

  /** Server-side upload of bytes we generated ourselves (e.g. a video poster
   *  frame extracted with ffmpeg). Returns the public URL. */
  async putObject(userId: string, body: Buffer, contentType: string, ext: string): Promise<string> {
    const key = `uploads/${userId}/${randomUUID()}.${ext}`;
    if (!this.s3) return `${this.publicBase}/${key}`;
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return `${this.publicBase}/${key}`;
  }

  // ─────────── private health-document vault (signed links only) ───────────

  /** Presign a PUT into the private health bucket. Returns the object key — NO
   *  public URL, because health documents must never be publicly reachable. */
  async presignHealthUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const key = `health/${userId}/${randomUUID()}.${ext}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * Presign an upload into the user's private DRIVE space. Same private bucket
   * as the health vault (one 10 GB vault per citizen), namespaced under
   * `drive/<userId>/` so ownership is provable from the key itself.
   */
  async presignDriveUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `drive/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * Presign a PUT for a DATING PHOTO. (M3.)
   *
   * The private bucket, not the public one, and that is the whole design.
   * Dating photos were base64 blobs inlined in every payload, which was slow
   * but had one accidental virtue: only a viewer the service had already judged
   * eligible ever received the bytes. Moving them to a public URL would have
   * made them faster AND permanently reachable by anyone who ever saw one —
   * trading a performance problem for a privacy one, and falsifying the Dating
   * Terms' promise that photos are shown only to people the profile allows.
   *
   * So: private object, short-lived signed GET issued per eligible viewer.
   */
  async presignDatingUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `dating/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * Presign a PUT for a DAYBOOK PHOTOGRAPH — a picture somebody put in their
   * diary. (15 Aug.)
   *
   * Its own namespace rather than the health vault's, though both are the same
   * private bucket. The prefix IS the permission: `isOwnHealthKey` guards three
   * medical routes that take a client-supplied key, and filing diary photos
   * under `health/` would mean a key from one feature satisfies another
   * feature's ownership check. One prefix per thing that can be owned.
   *
   * The public bucket was never a candidate. A post, a listing and a menu photo
   * all want a permanent public address; the picture of the afternoon somebody
   * wrote about wants the opposite, and the only reason it is a decision at all
   * is that the public path is one line shorter to write.
   */
  async presignDaybookUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `daybook/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /**
   * A PLACE TO PUT A PHOTOGRAPH OF SOMEBODY'S ANIMAL.
   *
   * The private vault, under `pets/<userId>/`, for the same reason the daybook
   * uses it: the public bucket hands out a permanent address, and a photo of a
   * dog is a photo of the room the dog is standing in. The bytes go
   * browser→vault; nothing here ever holds them.
   */
  async presignPetUpload(userId: string, mimeType: string, ext: string): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `pets/${userId}/${randomUUID()}.${safeExt}`;
    if (!this.s3) {
      return { uploadUrl: `${this.publicBase}/__presigned__/${key}`, key, expiresInSec: this.expiresInSec };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.healthBucket, Key: key, ContentType: mimeType }),
      { expiresIn: this.expiresInSec },
    );
    return { uploadUrl, key, expiresInSec: this.expiresInSec };
  }

  /** True when this key belongs to the given user's pet namespace. */
  static isOwnPetKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`pets/${userId}/`);
  }

  /** True when this key belongs to the given user's daybook namespace. */
  static isOwnDaybookKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`daybook/${userId}/`);
  }

  /* THE THREE HELPERS BELOW ARE BUCKET-LEVEL, NOT HEALTH-LEVEL. They are named
     for the vault's first tenant and operate on every object in it — drive,
     dating and now daybook all use them. These aliases say so at the call site,
     so a diary photo is not deleted by something called `deleteHealthObject`. */
  async privateObjectExists(key: string): Promise<boolean> { return this.healthObjectExists(key); }
  async deletePrivateObject(key: string): Promise<void> { return this.deleteHealthObject(key); }

  /**
   * True when this key belongs to the given user's dating namespace.
   *
   * The same guard Drive and the health vault carry, for the same reason: the
   * key arrives from the client when a profile is saved, and without this a
   * citizen could file somebody else's object as their own photo.
   */
  static isOwnDatingKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`dating/${userId}/`);
  }

  /** True when this key belongs to the given user's private drive namespace. */
  static isOwnDriveKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`drive/${userId}/`);
  }

  /**
   * True when this key belongs to the given user's private health namespace.
   *
   * The health vault takes a client-supplied key on three routes, and until
   * this existed there was no equivalent of the Drive check — filing a key
   * from someone else's namespace would have created a record pointing at
   * their document, which the download and delete routes then honoured.
   * Reaching that needed the key, which is a randomUUID nothing discloses, but
   * the sibling module guards the identical pattern and this one should too.
   */
  static isOwnHealthKey(userId: string, key: string): boolean {
    return typeof key === 'string' && key.startsWith(`health/${userId}/`);
  }

  /**
   * A longer-lived signed GET link, for files handed to someone OUTSIDE the
   * city (e.g. a big attachment emailed as a download link rather than MIME).
   * Capped at 7 days — the maximum lifetime S3/R2 signatures allow.
   */
  async presignShareLink(key: string, ttlSec = 7 * 24 * 3600): Promise<string | null> {
    if (!this.s3 || !key) return null;
    const expiresIn = Math.min(Math.max(60, ttlSec), 7 * 24 * 3600);
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.healthBucket, Key: key }), { expiresIn });
    } catch (e) {
      this.logger.warn(`presignShareLink failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Server-side write into the private vault, for bytes this API produced
   * itself (an avatar it drew, say) rather than bytes a browser uploaded.
   *
   * Returns the object key, or null when storage isn't configured — null rather
   * than a plausible-looking key, so a caller cannot file a row pointing at a
   * file that was never written.
   */
  async putPrivateObject(prefix: string, userId: string, body: Buffer, contentType: string, ext: string): Promise<string | null> {
    if (!this.s3) return null;
    const safePrefix = (prefix || 'misc').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'misc';
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const key = `${safePrefix}/${userId}/${randomUUID()}.${safeExt}`;
    try {
      await this.s3.send(new PutObjectCommand({ Bucket: this.healthBucket, Key: key, Body: body, ContentType: contentType }));
      return key;
    } catch (e) {
      this.logger.warn(`putPrivateObject failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /** Short-lived signed GET URL for a private health document (owner-only, handed
   *  out by the authenticated backend). Returns null when storage isn't configured. */
  async presignPrivateDownload(key: string): Promise<string | null> {
    return this.presignHealthDownload(key);
  }

  async presignHealthDownload(key: string): Promise<string | null> {
    if (!this.s3 || !key) return null;
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.healthBucket, Key: key }), { expiresIn: this.downloadTtlSec });
    } catch (e) {
      this.logger.warn(`presignHealthDownload failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  async getHealthObjectBase64(key: string): Promise<{ base64: string; contentType: string } | null> {
    return this.getObjectBase64(key, this.healthBucket);
  }

  /** Confirm a just-uploaded health object actually landed in the vault, so we
   *  never file a record that points at a file the browser failed to PUT. When
   *  storage isn't configured (dev/demo) we can't check, so we don't block. */
  async healthObjectExists(key: string): Promise<boolean> {
    if (!this.s3 || !key) return true;
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.healthBucket, Key: key }));
      return true;
    } catch (e) {
      this.logger.warn(`healthObjectExists: ${key} not found (${(e as Error).message})`);
      return false;
    }
  }

  /** The stored size of a vault object, or null when it cannot be read. */
  async healthObjectSize(key: string): Promise<number | null> {
    if (!this.s3 || !key) return null;
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.healthBucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (e) {
      this.logger.warn(`healthObjectSize: ${key} (${(e as Error).message})`);
      return null;
    }
  }

  async deleteHealthObject(key: string): Promise<void> {
    return this.deleteObject(key, this.healthBucket);
  }

  /** Read an object back as base64 (for AI vision on uploaded reports). Returns
   *  null when storage isn't configured or the object can't be read. */
  async getObjectBase64(key: string, bucket?: string): Promise<{ base64: string; contentType: string } | null> {
    if (!this.s3) return null;
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        base64: Buffer.from(bytes).toString('base64'),
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch (e) {
      this.logger.warn(`getObject failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  /** Delete an object (frees the citizen's vault quota). No-op if unconfigured. */
  async deleteObject(key: string, bucket?: string): Promise<void> {
    if (!this.s3 || !key) return;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }));
    } catch (e) {
      this.logger.warn(`deleteObject failed for ${key}: ${(e as Error).message}`);
    }
  }

  /** Derive the object key from a stored public URL (for legacy rows without a key). */
  keyFromUrl(url: string): string {
    if (this.publicBase && url.startsWith(this.publicBase)) return url.slice(this.publicBase.length + 1);
    return '';
  }
}
