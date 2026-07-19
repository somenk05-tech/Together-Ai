import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe, parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { DatingService } from './dating.service';
import {
  MatchesQuerySchema,
  MatchKindSchema,
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

  @Get('matches')
  matches(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    const { kind } = parseOrThrow(MatchesQuerySchema, query);
    return this.dating.matches(user.sub, kind);
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
    return this.dating.unlockChat(user.sub, targetUserId, kind, method);
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
