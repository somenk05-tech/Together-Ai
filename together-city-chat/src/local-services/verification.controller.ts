import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { VerificationService } from './verification.service';
import { SubmitVerificationSchema, type SubmitVerificationDto, SubmitVideoSchema, type SubmitVideoDto, VideoPresignSchema, type VideoPresignDto } from './dto/verification.dto';

/**
 * THE OWNER'S SIDE OF VERIFICATION.
 *
 * Its own controller because both routes are about the person who owns the
 * listing and nobody else — there is no public read here at all. What a citizen
 * sees of any of this is a badge on the business page, and that travels on the
 * listing itself rather than through a route somebody could enumerate.
 *
 * The console's side is in the admin module, where the permission check and the
 * audit row live. A decision route outside that module is a decision nobody
 * wrote down.
 */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get(':id/verification')
  read(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.verification.read(user.sub, id);
  }

  @Post(':id/verification')
  @UsePipes(new ZodValidationPipe(SubmitVerificationSchema))
  submit(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SubmitVerificationDto) {
    return this.verification.submit(user.sub, id, dto);
  }

  /* THE CLIP GOES INTO THE VAULT (launch blocker 3, 2 Sep). It used to go
     through the public media door — a permanent unauthenticated address for a
     video of an owner in their shop saying their own name. Two calls now, the
     shape every private file in the city uses: presign a PUT under
     `kyc/<ownerId>/`, then file the key. Nothing reads it back yet; the
     console screen that will is the one the launch gate lists as missing,
     and when it arrives it signs a short link for a moderator, not a URL. */
  @Post(':id/verification/video/presign')
  @UsePipes(new ZodValidationPipe(VideoPresignSchema))
  presignVideo(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: VideoPresignDto) {
    return this.verification.presignVideo(user.sub, id, dto.mimeType, dto.sizeBytes);
  }

  /** The owner on video, sent for a person to watch. Same split as the
   *  document: submitting decides nothing. */
  @Post(':id/verification/video')
  @UsePipes(new ZodValidationPipe(SubmitVideoSchema))
  submitVideo(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SubmitVideoDto) {
    return this.verification.submitVideo(user.sub, id, dto.videoKey);
  }
}
