import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../auth/verified.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe, parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { DatingService } from './dating.service';
import {
  MatchesQuerySchema,
  MatchKindSchema,
  ReportMatchSchema,
  type ReportMatchDto,
  UpsertDatingProfileSchema, type UpsertDatingProfileDto,
  CreateActivitySchema, type CreateActivityDto, RespondInviteSchema, TrustSchema,
} from './dto/dating.dto';

@Controller('dating')
@UseGuards(JwtAuthGuard)
export class DatingController {
  constructor(private readonly dating: DatingService) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.dating.getProfile(user.sub);
  }

  @Post('profile')
  @UsePipes(new ZodValidationPipe(UpsertDatingProfileSchema))
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertDatingProfileDto) {
    return this.dating.upsertProfile(user.sub, dto);
  }

  @Delete('profile')
  deleteProfile(@CurrentUser() user: JwtUser) {
    return this.dating.deleteProfile(user.sub);
  }

  @Get('matches')
  matches(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.matches(user.sub, kind);
  }

  @Get('discover')
  discover(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.discover(user.sub, kind);
  }

  @Get('stack')
  stack(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.stack(user.sub, kind);
  }

  @Get('matches/:targetUserId')
  matchDetail(@CurrentUser() user: JwtUser, @Param('targetUserId') targetUserId: string, @Query() query: Record<string, unknown>) {
    const { kind } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.matchDetail(user.sub, targetUserId, kind);
  }

  @Post('matches/:targetUserId/like')
  like(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.like(user.sub, targetUserId, kind);
  }

  @UseGuards(VerifiedGuard)
  @Post('matches/:targetUserId/unlock-chat')
  unlockChat(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    const method = (body as { method?: 'wallet' | 'card' } | null)?.method;
    return this.dating.connect(user.sub, targetUserId, kind, method);
  }

  // Opening a chat with another citizen → requires a confirmed email.
  @Post('matches/:targetUserId/connect')
  @UseGuards(VerifiedGuard)
  connect(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    const method = (body as { method?: 'wallet' | 'card' } | null)?.method;
    return this.dating.connect(user.sub, targetUserId, kind, method);
  }

  @Post('matches/:targetUserId/unmatch')
  unmatch(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.unmatch(user.sub, targetUserId, kind);
  }

  @Post('matches/:targetUserId/reveal')
  reveal(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    // `show` is optional and defaults to true, so an older client that sends
    // only { kind } keeps revealing exactly as it did.
    const show = parseOrThrow(z.boolean().optional().default(true), (body as { show?: boolean } | null)?.show);
    return this.dating.reveal(user.sub, targetUserId, kind, show);
  }

  @Get('chats')
  chats(@CurrentUser() user: JwtUser) {
    return this.dating.datingChats(user.sub);
  }

  @Get('admin/stats')
  adminStats(@CurrentUser() user: JwtUser) {
    return this.dating.adminStats(user.sub);
  }

  @Post('matches/:targetUserId/pass')
  pass(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.pass(user.sub, targetUserId, kind);
  }

  // ─── Safety. Reachable from the match, the profile and the chat (H6). ───
  @Post('matches/:targetUserId/block')
  blockMatch(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.blockMatch(user.sub, targetUserId, kind);
  }

  @Post('matches/:targetUserId/report')
  @UsePipes(new ZodValidationPipe(ReportMatchSchema))
  reportMatch(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: ReportMatchDto,
  ) {
    return this.dating.reportMatch(user.sub, targetUserId, dto.reason);
  }

  // ─── Activity Dating ───
  @Post('activities')
  @UsePipes(new ZodValidationPipe(CreateActivitySchema))
  createActivity(@CurrentUser() user: JwtUser, @Body() dto: CreateActivityDto) {
    return this.dating.createActivity(user.sub, dto);
  }

  @Get('activities/mine')
  myActivities(@CurrentUser() user: JwtUser) {
    return this.dating.myActivities(user.sub);
  }

  @Get('activities/invites')
  activityInvites(@CurrentUser() user: JwtUser) {
    return this.dating.receivedInvites(user.sub);
  }

  @Post('activities/invites/:id/respond')
  respondInvite(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const { action } = parseOrThrow(RespondInviteSchema, body);
    return this.dating.respondInvite(user.sub, id, action);
  }

  @Post('activities/invites/:id/trust')
  trust(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const { step } = parseOrThrow(TrustSchema, body);
    return this.dating.advanceTrust(user.sub, id, step);
  }
}
