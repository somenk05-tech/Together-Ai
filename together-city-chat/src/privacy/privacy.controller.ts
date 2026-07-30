import { Body, Controller, Get, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { PrivacyService } from './privacy.service';
import { PrivacySetSchema, type PrivacySetDto } from './dto/privacy.dto';

@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  get(@CurrentUser() user: JwtUser) {
    return this.privacy.get(user.sub);
  }

  /**
   * GET /api/privacy/export — everything this citizen can take with them.
   *
   * Returned as JSON rather than a generated archive: it is the same data
   * either way, and a file the browser saves is one less place for a copy of
   * somebody's medical history to sit on a server waiting to be collected.
   */
  @Get('export')
  exportData(@CurrentUser() user: JwtUser) {
    return this.privacy.exportForCitizen(user.sub);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(PrivacySetSchema))
  set(@CurrentUser() user: JwtUser, @Body() dto: PrivacySetDto) {
    return this.privacy.set(user.sub, dto.key, dto.value);
  }
}
