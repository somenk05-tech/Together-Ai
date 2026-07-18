import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, PresignedUpload } from './storage.provider';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
};

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
    const ext = EXT[mimeType];
    if (!ext) throw new BadRequestException(`Unsupported mime type: ${mimeType}`);
    // Virus-scan hook: enqueue key for scanning before it is served (stub).
    return this.storage.presignUpload(userId, mimeType, ext);
  }
}
