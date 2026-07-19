import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, PresignedUpload } from './storage.provider';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',        // iPhone photos of reports
  'image/heif': 'heif',
  'image/tiff': 'tiff',        // scanned documents
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

/**
 * The extension to store a file under. Health documents come in every shape a
 * clinic hands out — phone photos (HEIC), scans (TIFF), doctor letters (DOCX) —
 * so we never reject a real file: unknown types fall back to a safe extension
 * derived from the MIME subtype rather than throwing "Unsupported mime type".
 */
function extFor(mimeType: string): string {
  if (EXT[mimeType]) return EXT[mimeType];
  const sub = (mimeType.split('/')[1] || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  return sub || 'bin';
}

@Injectable()
export class MediaService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue a pre-signed URL. The client uploads directly to R2/S3, then sends a
   * message with the returned publicUrl as an attachment.
   *
   * Post-upload processing (thumbnail generation, image compression, video
   * transcode) is designed as an async worker triggered by an R2/S3 event or a
   * queue — see ARCHITECTURE.md → Media pipeline. Hooks: generateThumbnail(),
   * compressImage(), transcodeVideo().
   */
  async requestUpload(userId: string, mimeType: string, sizeBytes: number): Promise<PresignedUpload> {
    const max = this.config.get<number>('policy.maxUploadBytes') ?? 52428800;
    if (sizeBytes > max) throw new BadRequestException(`File exceeds ${max} bytes`);
    if (!mimeType) throw new BadRequestException('Missing file type');
    // Virus-scan hook: enqueue key for scanning before it is served (stub).
    return this.storage.presignUpload(userId, mimeType, extFor(mimeType));
  }

  /** Presign a PUT into the PRIVATE health vault (no public URL is returned). */
  async requestPrivateUpload(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    const max = this.config.get<number>('policy.maxUploadBytes') ?? 52428800;
    if (sizeBytes > max) throw new BadRequestException(`File exceeds ${max} bytes`);
    if (!mimeType) throw new BadRequestException('Missing file type');
    return this.storage.presignHealthUpload(userId, mimeType, extFor(mimeType));
  }
}
