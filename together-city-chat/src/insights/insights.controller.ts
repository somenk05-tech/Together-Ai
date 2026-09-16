import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AdminAccessService } from '../admin/admin-access.service';
import { investorPasswordOk } from '../analytics/visits.service';
import { CurrentUser } from '../shared/current-user.decorator';
import { Public } from '../shared/public.decorator';
import { JwtUser } from '../shared/types';
import { parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { isRangeKey, type RangeKey } from './insights.config';
import { InsightsService, type View } from './insights.service';
import { MemberOriginService } from './member-origin.service';

/**
 * ── /investor/analytics, SERVER SIDE (owner, 16 Sep) ───────────────────────
 *
 * Two doors to the same aggregates:
 *   GET /insights?section=…           — a signed-in account holding
 *                                       `analytics.read` (the founder role
 *                                       holds every permission): the founder view
 *   GET /insights/investor?section=…  — the investor password the deck already
 *                                       uses: the investor view, which leaves out
 *                                       per-model AI detail, in-app credit totals
 *                                       and the error-by-error timeline
 * Sections load separately so the page can ask for each as it scrolls. The
 * section is a query value, not a path segment: it names a report, never a
 * record, and a public route must not take an id (route-exposure.spec.ts).
 */
const SECTIONS = ['overview', 'city', 'retention', 'reach', 'ai', 'money', 'health', 'live'] as const;
type Section = (typeof SECTIONS)[number];

const rangeOf = (raw: unknown): RangeKey => (isRangeKey(raw) ? raw : '30d');

function run(svc: InsightsService, section: string, range: RangeKey, view: View) {
  switch (section as Section) {
    case 'overview': return svc.overview(range, view);
    case 'city': return svc.city(range, view);
    case 'retention': return svc.retention();
    case 'reach': return svc.reach(range, view);
    case 'ai': return svc.ai(range, view);
    case 'money': return svc.money(view);
    case 'health': return svc.health(view);
    case 'live': return svc.live();
    default: throw new NotFoundException('No such section.');
  }
}

@Controller('insights')
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly access: AdminAccessService,
    private readonly origins: MemberOriginService,
  ) {}

  /** Where this member first came from — sent once by the web after sign-in. */
  @Post('origin')
  @HttpCode(204)
  async origin(@CurrentUser() user: JwtUser, @Body() body: unknown): Promise<void> {
    await this.origins.record(user.sub, parseOrThrow(OriginSchema, body ?? {}));
  }

  @Public()
  @Get('investor')
  investor(@Query('section') section: unknown, @Query('range') range: unknown, @Headers('x-investor-password') password?: string) {
    if (!investorPasswordOk(password)) throw new ForbiddenException('Wrong password.');
    return run(this.insights, String(section ?? ''), rangeOf(range), 'investor');
  }

  @Get()
  async founder(@CurrentUser() user: JwtUser, @Query('section') section: unknown, @Query('range') range: unknown) {
    await this.access.assert(user.sub, 'analytics.read');
    return run(this.insights, String(section ?? ''), rangeOf(range), 'founder');
  }
}

const text = (max: number) => z.string().trim().max(max).optional().nullable();
export const OriginSchema = z.object({
  visitor: text(80),
  source: text(80),
  medium: text(80),
  campaign: text(120),
  content: text(120),
  term: text(120),
  referrer: text(200),
  landedAt: z.string().datetime().optional().nullable(),
});
export type OriginDto = z.infer<typeof OriginSchema>;
