import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MediaService } from './media.service';

const PresignSchema = z.object({
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
type PresignDto = z.infer<typeof PresignSchema>;

/* A PRESIGN IS A WRITE INTO THE BUCKET, and it had no ceiling of its own —
   only the global per-IP 120/minute, shared with every read in the app. The
   dating hub caps its own uploads at 10/minute for exactly this reason
   (`dating.controller.ts`); this is the general door to the same buckets.
   Generous enough for a gallery of attachments, small enough that the bucket
   is not a place to park data at somebody else's expense. */
const PRESIGN_LIMIT = { default: { limit: 30, ttl: 60_000 } };

@Controller('media')
@UseGuards(JwtAuthGuard)
@Throttle(PRESIGN_LIMIT)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // POST /api/media/upload  → returns a pre-signed URL for direct-to-bucket upload
  @Post('upload')
  requestUpload(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(PresignSchema)) dto: PresignDto,
  ) {
    return this.media.requestUpload(user.sub, dto.mimeType, dto.sizeBytes);
  }

  /* POST /api/media/upload-post → presigned PUT into the PRIVATE bucket for a
     post's photograph or video. Its own route rather than a flag on `upload`,
     because the two doors have different rules — this one takes an allowlist
     and writes where nothing is readable without a signature. */
  @Post('upload-post')
  requestPostUpload(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(PresignSchema)) dto: PresignDto,
  ) {
    return this.media.requestPostUpload(user.sub, dto.mimeType, dto.sizeBytes);
  }

  // POST /api/media/upload-private → presigned PUT into the private health vault
  @Post('upload-private')
  requestPrivateUpload(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(PresignSchema)) dto: PresignDto,
  ) {
    return this.media.requestPrivateUpload(user.sub, dto.mimeType, dto.sizeBytes);
  }
}
