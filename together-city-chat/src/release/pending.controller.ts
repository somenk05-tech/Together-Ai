import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DevAccountGuard } from './dev-account.guard';
import { ReleaseService } from './release.service';

/**
 * What the developer copy has that the live site does not — for the floating
 * Go live button on every developer page. Read-only; see DevAccountGuard.
 */
@Controller('release')
@UseGuards(DevAccountGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class PendingController {
  constructor(private readonly release: ReleaseService) {}

  @Get('pending')
  pending() { return this.release.pending(); }
}
