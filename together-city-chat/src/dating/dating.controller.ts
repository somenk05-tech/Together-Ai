import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Res, StreamableFile, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../shared/public.decorator';
import { z } from 'zod';
import { Throttle } from '@nestjs/throttler';
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
  ModerationDecisionSchema, PhotoDecisionSchema, AppealSchema, AppealDecisionSchema, FunnelQuerySchema,
} from './dto/dating.dto';

/**
 * Per-route ceilings under the app-wide 120/min. The three list reads each
 * scan up to POOL_CEILING rows and sign every card's photos; a citizen
 * refreshing once a second was the cheapest way to take the hub down. The
 * decision routes are cheap but every one is a notification to somebody else.
 * Same mechanism as mira.controller.ts — ThrottlerGuard is already global.
 */
const LIST_LIMIT = { default: { ttl: 60_000, limit: 20 } };
const DECISION_LIMIT = { default: { ttl: 60_000, limit: 60 } };
const UPLOAD_LIMIT = { default: { ttl: 60_000, limit: 10 } };
const REPORT_LIMIT = { default: { ttl: 60_000, limit: 5 } };

@Controller('dating')
@UseGuards(JwtAuthGuard)
export class DatingController {
  constructor(private readonly dating: DatingService) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.dating.getProfile(user.sub);
  }

  @Post('profile')
  // A dating profile is created by somebody whose email is theirs. The guard
  // existed and nothing used it; a throwaway address could stand up a profile
  // and start liking within a minute of signing up.
  @UseGuards(VerifiedGuard)
  @UsePipes(new ZodValidationPipe(UpsertDatingProfileSchema))
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertDatingProfileDto) {
    return this.dating.upsertProfile(user.sub, dto);
  }

  @Delete('profile')
  deleteProfile(@CurrentUser() user: JwtUser) {
    return this.dating.deleteProfile(user.sub);
  }

  @Get('matches')
  @Throttle(LIST_LIMIT)
  matches(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind, limit } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.matches(user.sub, kind, limit);
  }

  @Get('discover')
  @Throttle(LIST_LIMIT)
  discover(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind, limit } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.discover(user.sub, kind, limit);
  }

  @Get('stack')
  @Throttle(LIST_LIMIT)
  stack(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind, limit } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.stack(user.sub, kind, limit);
  }

  @Get('matches/:targetUserId')
  matchDetail(@CurrentUser() user: JwtUser, @Param('targetUserId') targetUserId: string, @Query() query: Record<string, unknown>) {
    const { kind } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.matchDetail(user.sub, targetUserId, kind);
  }

  @Post('matches/:targetUserId/like')
  @Throttle(DECISION_LIMIT)
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
    return this.dating.connect(user.sub, targetUserId, kind);
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
  @Throttle(DECISION_LIMIT)
  connect(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const kind = parseOrThrow(MatchKindSchema.optional().default('romantic'), (body as { kind?: string } | null)?.kind);
    return this.dating.connect(user.sub, targetUserId, kind);
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

  // Metered like every other decision on a match: revealing writes a row and,
  // the first time, sends a push. Untethered it was the global 120/min.
  @Throttle(DECISION_LIMIT)
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

  /**
   * ONE PHOTOGRAPH, TO THE VIEWER ITS LINK NAMES.
   *
   * `@Public` because an `<img>` tag cannot send an Authorization header — the
   * token in the path is what stands in for the session, and it names a viewer
   * and a key and is signed by this API. That is not the same as knowing who is
   * holding it, and the point is not authentication: it is that the permission
   * question is asked AGAIN, here, on every fetch. A presigned S3 link answered
   * it once at mint and could not be revoked; a block, a takedown or a rejected
   * photo now kills the link on the next request.
   *
   * One 404 for every refusal — bad signature, expired, taken down, blocked —
   * because a route that distinguishes them tells whoever holds the string
   * something about the person in the photograph.
   */
  @Public()
  @Throttle(LIST_LIMIT)
  @Get('photo/:token')
  async photo(@Param('token') token: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const found = await this.dating.openPhoto(token);
    if (!found) throw new NotFoundException('That photo is not available.');
    res.set({
      'Content-Type': found.contentType,
      // Private and short-lived: a shared cache holding this would hand it to
      // somebody the check above would have refused.
      'Cache-Control': 'private, max-age=50',
      ...(found.contentLength ? { 'Content-Length': String(found.contentLength) } : {}),
    });
    return new StreamableFile(found.body);
  }

  @Throttle(LIST_LIMIT)
  @Get('chats')
  chats(@CurrentUser() user: JwtUser) {
    return this.dating.datingChats(user.sub);
  }

  @Get('admin/stats')
  adminStats(@CurrentUser() user: JwtUser) {
    return this.dating.adminStats(user.sub);
  }

  /**
   * Move a dating profile out of `review` — the queue `adminStats` counts and
   * nothing in the codebase could empty. The only write to `moderation` was the
   * automatic decision taken on save, so a profile that landed in review stayed
   * there for good, and one a moderator wanted off the platform could not be put
   * there at all.
   */
  @Post('admin/moderation/:targetUserId')
  moderateDecision(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const dto = parseOrThrow(ModerationDecisionSchema, body);
    return this.dating.moderateDecision(user.sub, targetUserId, dto.decision, dto.reason);
  }

  /** Photos Rekognition held for a person to look at, oldest first. */
  @Get('admin/photos')
  photoQueue(@CurrentUser() user: JwtUser) {
    return this.dating.photoQueue(user.sub);
  }

  @Post('admin/photos/decide')
  photoDecision(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const dto = parseOrThrow(PhotoDecisionSchema, body);
    return this.dating.photoDecision(user.sub, dto.key, dto.decision, dto.reason);
  }

  /** One-off: review every photo that predates photo review. Idempotent. */
  @Post('admin/photos/backfill')
  photoBackfill(@CurrentUser() user: JwtUser) {
    return this.dating.backfillPhotoReviews(user.sub);
  }

  /** Where people stop, and where the numbers sit. */
  @Get('admin/funnel')
  funnel(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { days } = parseOrThrow(FunnelQuerySchema, query);
    return this.dating.adminFunnel(user.sub, days);
  }

  // ─── Appeals: a decision on your profile or photo can be argued with. ───

  @Post('appeals')
  @Throttle(REPORT_LIMIT)
  appeal(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const dto = parseOrThrow(AppealSchema, body);
    return this.dating.appeal(user.sub, dto.kind, dto.targetId, dto.text);
  }

  @Get('appeals/mine')
  myAppeals(@CurrentUser() user: JwtUser) {
    return this.dating.myAppeals(user.sub);
  }

  @Get('admin/appeals')
  appealQueue(@CurrentUser() user: JwtUser) {
    return this.dating.appealQueue(user.sub);
  }

  @Post('admin/appeals/:id/decide')
  decideAppeal(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const dto = parseOrThrow(AppealDecisionSchema, body);
    return this.dating.decideAppeal(user.sub, id, dto.decision, dto.reason);
  }

  @Post('matches/:targetUserId/pass')
  @Throttle(DECISION_LIMIT)
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
  @Throttle(UPLOAD_LIMIT)
  presignPhoto(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const b = (body ?? {}) as { mimeType?: string; sizeBytes?: number };
    // Passed through as given. A missing size is NaN, and the service refuses
    // NaN; the old `?? 0` turned "no size" into "zero bytes", which passed.
    return this.dating.presignPhoto(user.sub, String(b.mimeType ?? ''), Number(b.sizeBytes));
  }

  /**
   * THE SELFIE'S ONE WRITE SITE (owner, 27 Aug).
   *
   * The bytes go browser→bucket through the presign above; this takes the key
   * and the server writes the mark itself. A profile save can no longer set it
   * or clear it — see selfie.ts for why that is the whole point.
   */
  /** The selfie's own presigned PUT. A separate route because it writes into a
   *  separate namespace, which is what stops a selfie ever being filed as a
   *  photo somebody chose to show. */
  @Post('selfie/presign')
  @Throttle(UPLOAD_LIMIT)
  presignSelfie(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const b = (body ?? {}) as { mimeType?: string; sizeBytes?: number };
    return this.dating.presignSelfie(user.sub, String(b.mimeType ?? ''), Number(b.sizeBytes));
  }

  @Post('selfie')
  @Throttle(UPLOAD_LIMIT)
  saveSelfie(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const b = (body ?? {}) as { key?: string };
    return this.dating.saveSelfie(user.sub, String(b.key ?? ''));
  }

  @Delete('selfie')
  clearSelfie(@CurrentUser() user: JwtUser) {
    return this.dating.clearSelfie(user.sub);
  }

  // ─── M2: a like you cannot spend twice, a super-like, and a way back. ───

  /** What is left of today, in the citizen's own timezone. */
  @Get('allowance')
  allowance(@CurrentUser() user: JwtUser) {
    return this.dating.likeAllowance(user.sub);
  }

  @Post('matches/:targetUserId/super-like')
  @Throttle(DECISION_LIMIT)
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
  @Throttle(REPORT_LIMIT)
  @UsePipes(new ZodValidationPipe(ReportMatchSchema))
  reportMatch(
    @CurrentUser() user: JwtUser,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: ReportMatchDto,
  ) {
    return this.dating.reportMatch(user.sub, targetUserId, dto.reason);
  }

}
