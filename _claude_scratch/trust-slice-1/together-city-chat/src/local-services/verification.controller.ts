import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { VerificationService } from './verification.service';
import { SubmitVerificationSchema, type SubmitVerificationDto } from './dto/verification.dto';

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
}
