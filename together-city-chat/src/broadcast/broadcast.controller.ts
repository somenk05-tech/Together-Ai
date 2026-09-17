import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { DevPasswordGuard } from '../dev/dev-password.guard';
import { BroadcastService, type CreateInput } from './broadcast.service';
import { SocialAccountsService } from './accounts.service';
import { ContentAnalyticsService, type AnalyticsQuery } from './content-analytics.service';
import { RANGE_KEYS } from './content-analytics-math';
import { CHANNEL_KEYS, PLATFORM_KEYS } from './channels';
import { TOPIC_KEYS } from './topics';

const SuggestSchema = z.object({
  topic: z.enum(TOPIC_KEYS),
  note: z.string().trim().max(500).default(''),
  fileName: z.string().trim().max(200).default(''),
});
type SuggestDto = z.infer<typeof SuggestSchema>;

/* Each field is capped at the platform's own limit or below it, so a box on
   the page can never hold more than the destination will take. */
const CreateSchema = z.object({
  topic: z.enum(TOPIC_KEYS),
  storageKey: z.string().min(1).max(500),
  note: z.string().trim().max(500).optional(),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4500).default(''),
  tags: z.array(z.string().trim().max(100)).max(30).default([]),
  caption: z.string().trim().max(2000).default(''),
  threadsText: z.string().trim().max(400).default(''),
  privacy: z.enum(['public', 'unlisted', 'private']).default('public'),
  aiDisclosure: z.boolean().default(false),
  channels: z.array(z.enum(CHANNEL_KEYS)).min(1),
  publish: z.boolean().default(false),
  series: z.string().trim().max(120).optional(),
  episode: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(120).optional(),
});

/* The analytics filters. A value outside the lists is refused, not ignored,
   so a typo in an address cannot quietly show everything. */
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const AnalyticsSchema = z.object({
  range: z.enum(RANGE_KEYS as [string, ...string[]]).default('30d'),
  from: DAY.optional(),
  to: DAY.optional(),
  platform: z.enum(CHANNEL_KEYS).optional(),
  topic: z.enum(TOPIC_KEYS).optional(),
  series: z.string().trim().min(1).max(120).optional(),
  episode: z.string().trim().min(1).max(120).optional(),
  campaign: z.string().trim().min(1).max(120).optional(),
  type: z.string().trim().regex(/^[a-z]{1,20}$/).optional(),
  published: z.enum(['all', 'period']).default('all'),
});

const ConnectSchema = z.object({ platform: z.enum(PLATFORM_KEYS as [string, ...string[]]), topic: z.enum(TOPIC_KEYS) });
type ConnectDto = z.infer<typeof ConnectSchema>;
const FinishSchema = z.object({ code: z.string().min(4).max(2000), state: z.string().min(20).max(1000) });
type FinishDto = z.infer<typeof FinishSchema>;

/**
 * ── THE MEDIA DESK, BEHIND THE SAME LOCKS AS THE REST OF /dev ───────────────
 *
 * An account on DEV_PAGE_ACCOUNTS, the page password, and then a console
 * GRANT for the act itself: drafting needs `cms.write`; connecting an account
 * and publishing need `notify.send`. Every one writes an audit row naming who
 * did it and why — this is the one screen that speaks to the outside world in
 * the city's name, and "who posted that" must have an answer.
 *
 * THE SIGN-IN COMES BACK THROUGH THE PAGE, NOT TO A PUBLIC ROUTE. The
 * platform redirects the pop-up to /dev/social/connected on the web app,
 * which hands the code to the page that opened it, which sends it here with
 * the password like every other request. No route below is reachable
 * without both locks.
 */
@Controller('dev/media')
@UseGuards(DevPasswordGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class BroadcastController {
  constructor(
    private readonly desk: BroadcastService,
    private readonly accounts: SocialAccountsService,
    private readonly analytics: ContentAnalyticsService,
  ) {}

  /** Every destination, every topic, every account slot. */
  @Get('channels')
  channels() {
    return this.desk.desk();
  }

  @Post('suggest')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(SuggestSchema))
  suggest(@Body() dto: SuggestDto) {
    return this.desk.suggest(dto.topic, dto.note, dto.fileName);
  }

  @Post('connect')
  @UsePipes(new ZodValidationPipe(ConnectSchema))
  connect(@CurrentUser() user: JwtUser, @Body() dto: ConnectDto, @Req() req: { ip?: string }) {
    return this.accounts.start(user.sub, dto.platform, dto.topic, req.ip ?? null);
  }

  @Post('connect/finish')
  @UsePipes(new ZodValidationPipe(FinishSchema))
  finish(@CurrentUser() user: JwtUser, @Body() dto: FinishDto, @Req() req: { ip?: string }) {
    return this.accounts.finish(user.sub, dto.code, dto.state, req.ip ?? null);
  }

  @Delete('accounts/:platform/:topic')
  disconnect(@CurrentUser() user: JwtUser, @Param('platform') platform: string, @Param('topic') topic: string, @Req() req: { ip?: string }) {
    return this.accounts.disconnect(user.sub, platform, topic, req.ip ?? null);
  }

  /* ── THE CONTENT ANALYTICS (owner, 17 Sep) — reads only; Refresh asks the
     platforms for public counts, never posts. */
  @Get('analytics')
  analyticsOverview(@CurrentUser() user: JwtUser, @Query(new ZodValidationPipe(AnalyticsSchema)) q: AnalyticsQuery) {
    return this.analytics.overview(user.sub, q);
  }

  @Post('analytics/refresh')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  analyticsRefresh(@CurrentUser() user: JwtUser) {
    return this.analytics.refresh(user.sub);
  }

  @Get('analytics/:id')
  analyticsDetail(@CurrentUser() user: JwtUser, @Param('id') id: string, @Query(new ZodValidationPipe(AnalyticsSchema)) q: AnalyticsQuery) {
    return this.analytics.detail(user.sub, id, q);
  }

  @Get()
  list() {
    return this.desk.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateInput, @Req() req: { ip?: string }) {
    return this.desk.create(user.sub, dto, req.ip ?? null);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: JwtUser, @Param('id') id: string, @Req() req: { ip?: string }) {
    return this.desk.publish(user.sub, id, req.ip ?? null);
  }

  @Post(':id/retry/:channel')
  retry(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('channel') channelKey: string, @Req() req: { ip?: string }) {
    return this.desk.retry(user.sub, id, channelKey, req.ip ?? null);
  }

  /** Removes the DESK RECORD. Nothing here can unpublish a post on a platform. */
  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string, @Req() req: { ip?: string }) {
    return this.desk.remove(user.sub, id, req.ip ?? null);
  }
}
