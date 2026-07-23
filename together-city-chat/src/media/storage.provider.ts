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
  private readonly corsOrigins: string[];
  private readonly expiresInSec = 900;
  private readonly downloadTtlSec = 300; // signed GET links for private health docs

  constructor(private readonly config: ConfigService) {
    const originsCsv = this.config.get<string>('media.corsOrigins') ?? '';
    this.corsOrigins = originsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (!this.corsOrigins.length) this.corsOrigins = DEFAULT_CORS_ORIGINS;
    this.bucket = this.config.get<string>('media.bucket') ?? '';
    // Private vault for medical documents. Falls back to the main bucket when a
    // dedicated private bucket isn't configured — health docs are still served
    // ONLY via short-lived signed links (never a stored public URL) either way.
    this.healthBucket = this.config.get<string>('media.privateBucket') || this.bucket;
    this.publicBase = this.config.get<string>('media.publicBaseUrl') ?? '';
    const endpoint = this.config.get<string>('media.endpoint') ?? '';
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

  /** Read back the LIVE CORS policy on each bucket so we can confirm browser
   *  uploads will be accepted — without digging through logs. */
  async corsStatus(): Promise<{ configured: boolean; buckets: Array<{ bucket: string; hasRule: boolean; allowsSite: boolean; origins: string[]; methods: string[]; error?: string }> }> {
    if (!this.s3) return { configured: false, buckets: [] };
    const names = Array.from(new Set([this.bucket, this.healthBucket].filter(Boolean)));
    const buckets = [];
    for (const bucket of names) {
      try {
        const res = await this.s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
        const rules = res.CORSRules ?? [];
        const origins = Array.from(new Set(rules.flatMap((r) => r.AllowedOrigins ?? [])));
        const methods = Array.from(new Set(rules.flatMap((r) => r.AllowedMethods ?? [])));
        const allowsSite = origins.some((o) => o === '*' || o.includes('togethercity.app')) && methods.includes('PUT');
        buckets.push({ bucket, hasRule: rules.length > 0, allowsSite, origins, methods });
      } catch (e) {
        buckets.push({ bucket, hasRule: false, allowsSite: false, origins: [], methods: [], error: (e as Error).message });
      }
    }
    return { configured: true, buckets };
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

  /** Short-lived signed GET URL for a private health document (owner-only, handed
   *  out by the authenticated backend). Returns null when storage isn't configured. */
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
