import { Body, Controller, Get, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { DevPasswordGuard } from './dev-password.guard';
import { DevService } from './dev.service';

const FlagSchema = z.object({
  key: z.string().min(1).max(64),
  enabled: z.boolean(),
  // Same rule as every other console action: long enough to be a sentence.
  // "Dating has been off since Tuesday" needs an answer, and the answer is here.
  reason: z.string().trim().min(8).max(500),
});
type FlagDto = z.infer<typeof FlagSchema>;

/**
 * The developer page.
 *
 * TWO LOCKS, NOT ONE. Every route here is behind the global JwtAuthGuard like
 * the rest of the API, and then behind DevPasswordGuard on top. Reaching this
 * needs an account AND the password, so a leaked password on its own opens
 * nothing.
 *
 * THROTTLED HARDER THAN THE REST OF THE API. The global limit is 120 requests a
 * minute, which is generous for a page and absurd for a password prompt — a
 * shared secret with 120 guesses a minute per client is a shared secret with
 * 170,000 guesses a day. Ten.
 */
@Controller('dev')
@UseGuards(DevPasswordGuard)
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class DevController {
  constructor(private readonly dev: DevService) {}

  /** The prompt calls this to find out whether the password was right. It
   *  returns the diagnostics rather than a bare ok, so a correct password is
   *  one round trip rather than two. */
  @Get('diagnostics')
  diagnostics() { return this.dev.diagnostics(); }

  @Get('flags')
  flags() { return this.dev.flags(); }

  @Post('flags')
  @UsePipes(new ZodValidationPipe(FlagSchema))
  setFlag(@CurrentUser() user: JwtUser, @Body() dto: FlagDto, @Req() req: { ip?: string }) {
    return this.dev.setFlag(user.sub, dto.key, dto.enabled, dto.reason, req.ip ?? null);
  }
}
