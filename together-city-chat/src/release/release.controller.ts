import { Body, Controller, Get, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { DevPasswordGuard } from '../dev/dev-password.guard';
import { ReleaseService } from './release.service';

const GoLiveSchema = z.object({
  hubs: z.array(z.string().min(1).max(40)).min(1).max(40),
  // Same rule as every console action: a sentence, so the log can answer why.
  reason: z.string().trim().min(8).max(500),
});
type GoLiveDto = z.infer<typeof GoLiveSchema>;

/**
 * The Go live button's three routes. Same three locks as the rest of /dev —
 * a signed-in account, DEV_PAGE_ACCOUNTS, the dev password — and the press
 * itself needs the `ops.deploy` grant and writes an audit row.
 */
@Controller('dev/release')
@UseGuards(DevPasswordGuard)
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class ReleaseController {
  constructor(private readonly release: ReleaseService) {}

  @Get()
  state() { return this.release.state(); }

  @Get('runs')
  runs() { return this.release.runs(); }

  @Post('go-live')
  @UsePipes(new ZodValidationPipe(GoLiveSchema))
  goLive(@CurrentUser() user: JwtUser, @Body() dto: GoLiveDto, @Req() req: { ip?: string }) {
    return this.release.goLive(user.sub, dto.hubs, dto.reason, req.ip ?? null);
  }
}
