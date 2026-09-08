import { Body, Controller, Get, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
  /**
   * AND IT IS THE MOST EXPENSIVE READ IN THE CITY. (Launch audit, 6 Sep.)
   *
   * `exportForCitizen` walks PURGE_RULES — 116 models — issuing a `findMany`
   * of up to PER_MODEL_CAP (5,000) rows each, serially, holding one Prisma
   * connection for the whole walk. On the global 120/min ceiling a single
   * account could issue ~12,000 heavy queries a minute through a pool of 20.
   *
   * Two an hour. A citizen exports their data when they are leaving or when a
   * regulator asks; nobody needs a third inside the hour, and the honest
   * long-term shape is an emailed link built off the queue, not a synchronous
   * route.
   */
  @Throttle({ default: { limit: 2, ttl: 3_600_000 } })
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
