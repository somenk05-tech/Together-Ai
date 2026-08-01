import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  /**
   * Opening a chat with somebody who has already matched you.
   *
   * This used to require a confirmed email and it was the wrong action to gate.
   * VerifiedGuard exists so an unconfirmed address cannot be used to REACH other
   * citizens — its own doc says "publishing content, listing property, entering
   * the dating pool". A mutual match is not that: two people have each chosen the
   * other, nobody is being broadcast at, and the second half of the consent is
   * already on record before this endpoint is reached.
   *
   * Meanwhile nothing in this controller gates creating a dating profile, which
   * IS the broadcast — an unconfirmed address becoming visible to everybody in
   * the pool. So the guard was on the action that did not need it and absent
   * from the one that arguably does.
   *
   * A guard is NOT being added there in the same breath. Verification e-mails
   * are not reliably arriving right now, and moving a lockout from a place it
   * does not belong to a place it does, while the way out of it is broken, just
   * relocates the harm. That belongs in a commit made after delivery is
   * confirmed working, on purpose, not as a side effect of this one.
   */
  @Post('matches/:targetUserId/connect')
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

  /**
   * A presigned PUT for a dating photo (M3). Private bucket — the browser
   * uploads straight to it and sends back only the key.
   */
  @Post('photos/presign')
  presignPhoto(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const b = (body ?? {}) as { mimeType?: string; sizeBytes?: number };
    return this.dating.presignPhoto(user.sub, String(b.mimeType ?? ''), Number(b.sizeBytes ?? 0));
  }

  // ─── M2: a like you cannot spend twice, a super-like, and a way back. ───

  /** What is left of today, in the citizen's own timezone. */
  @Get('allowance')
  allowance(@CurrentUser() user: JwtUser) {
    return this.dating.likeAllowance(user.sub);
  }

  @Post('matches/:targetUserId/super-like')
  superLike(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.like(user.sub, targetUserId, kind, { superLike: true });
  }

  /** Give back the most recent pass. Never an unmatch — see undoLastPass. */
  @Post('undo-pass')
  undoPass(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.undoLastPass(user.sub, kind);
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
