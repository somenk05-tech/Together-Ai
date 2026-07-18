import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
export class StorageProvider {
  private readonly logger = new Logger(StorageProvider.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly publicBase: string;
  private readonly expiresInSec = 900;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('media.bucket') ?? '';
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
}
