import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../shared/public.decorator';
import { swallow } from '../shared/swallow';
import { VisitOriginGuard } from './visit-origin.guard';
import { originOf } from './visit-origin';
import { arrivalOf } from '../broadcast/tracking';
import { VisitsService, investorPasswordOk, isAutomated, visitorKey, type VisitStats } from './visits.service';

/**
 * The visit beacon and the Investor page's counter. See visits.service.ts.
 *
 * BOTH ARE @Public: the beacon because most visitors have no account, and the
 * counter because an investor opening /investor has none either. The beacon
 * is held to coming from the city's own pages by VisitOriginGuard. The counter
 * is locked by the page password instead, checked here on every read, so the
 * numbers are never served to anybody who has not typed it.
 */
@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  /** One opening of the site. Always 204, even for a crawler that is not
   *  counted, so the beacon teaches a script nothing. */
  @Public()
  @UseGuards(VisitOriginGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post()
  @HttpCode(204)
  hit(@Body() body: Record<string, unknown> | undefined, @Req() req: { ip?: string; headers: Record<string, unknown> }): void {
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    if (isAutomated(ua)) return;
    const key = visitorKey(body?.id, req.ip ?? '', ua);
    // Not awaited: a count that fails to write is a gap in a number, never a
    // failed page load.
    // Where the visit came from (owner, 16 Sep: acquisition by source) — kept
    // on the visitor's FIRST visit only, and the referring host, never the address.
    void swallow(this.visits.record(key, originOf(body, ua)), 'visits: record');
    // This load came through a Together Social link (owner, 17 Sep): count
    // the arrival against the post, whether or not it is the browser's first.
    const arrived = arrivalOf(body);
    if (arrived) void swallow(this.visits.arrival(key, arrived.tag, arrived.channel), 'visits: social arrival');
  }

  /** The live numbers, for whoever holds the Investor page password. The
   *  throttle bounds guessing; the page polls well inside it. */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  @Get('stats')
  async stats(@Headers('x-investor-password') password?: string): Promise<VisitStats> {
    if (!investorPasswordOk(password)) throw new ForbiddenException('Wrong password.');
    return this.visits.stats();
  }
}
