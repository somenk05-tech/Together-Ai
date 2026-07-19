import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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

@Controller('media')
@UseGuards(JwtAuthGuard)
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

  // POST /api/media/upload-private → presigned PUT into the private health vault
  @Post('upload-private')
  requestPrivateUpload(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(PresignSchema)) dto: PresignDto,
  ) {
    return this.media.requestPrivateUpload(user.sub, dto.mimeType, dto.sizeBytes);
  }
}
