import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Deprecated } from '../shared/deprecated.decorator';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../auth/verified.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { SocialService } from './social.service';
import {
  CreateCommentSchema, type CreateCommentDto,
  CreatePostSchema, type CreatePostDto,
  FeedQuerySchema,
} from './dto/social.dto';

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('feed')
  feed(@CurrentUser() user: JwtUser, @Query() query: Record<string, unknown>) {
    return this.social.feed(user.sub, parseOrThrow(FeedQuerySchema, query));
  }

  // Behind a removed tab: the City Map page was removed by the review (p18).
  @Deprecated({
    since: '2026-07-30', sunset: '2026-08-30',
    replacement: '/api/social/feed',
  })
  @Get('map')
  map(@CurrentUser() user: JwtUser) {
    return this.social.map(user.sub);
  }

  @Get('followers')
  followers(@CurrentUser() user: JwtUser) {
    return this.social.followers(user.sub);
  }

  @Get('following')
  following(@CurrentUser() user: JwtUser) {
    return this.social.following(user.sub);
  }

  // Follow a citizen by handle or id (idempotent).
  @Post('follow')
  follow(@CurrentUser() user: JwtUser, @Body() dto: { handle?: string; userId?: string }) {
    return this.social.follow(user.sub, dto?.userId ?? dto?.handle ?? '');
  }

  // Stop following someone.
  @Delete('follow/:userId')
  unfollow(@CurrentUser() user: JwtUser, @Param('userId') userId: string) {
    return this.social.unfollow(user.sub, userId);
  }

  // Publishing to the city feed is public-facing → requires a confirmed email.
  @Post('posts')
  @UseGuards(VerifiedGuard)
  @UsePipes(new ZodValidationPipe(CreatePostSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePostDto) {
    return this.social.createPost(user.sub, dto);
  }

  @UseGuards(VerifiedGuard)
  @Patch('posts/:id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    // Same cap as create (2200) — an edit must not exceed the create limit.
    // Both fields optional: edit the caption, and/or re-sort the post into a
    // Work / Personal category (or clear it with null) from the profile.
    const dto = parseOrThrow(
      z.object({
        text: z.string().max(2200).optional(),
        category: z.enum(['work', 'personal']).nullable().optional(),
      }),
      body,
    );
    return this.social.updatePost(user.sub, id, dto);
  }

  @Delete('posts/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.social.deletePost(user.sub, id);
  }

  @Get('posts/:id/comments')
  comments(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.social.comments(user.sub, id);
  }

  @UseGuards(VerifiedGuard)
  @Post('posts/:id/comments')
  comment(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto: CreateCommentDto = parseOrThrow(CreateCommentSchema, body);
    return this.social.comment(user.sub, id, dto);
  }

  @Post('posts/:id/like')
  like(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.social.toggleLike(user.sub, id);
  }

  // Repost (share to feed) — appears at the top of the reposter's network feed.
  @UseGuards(VerifiedGuard)
  @Post('posts/:id/repost')
  repost(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.social.repost(user.sub, id);
  }

  // Pin a video post's cover frame (server-side ffmpeg extraction at `time`).
  @Patch('posts/:id/cover')
  setCover(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const { time } = parseOrThrow(z.object({ time: z.number().min(0).max(86_400) }), body);
    return this.social.setCover(user.sub, id, time);
  }

  // ─────────────── safety: block & report ───────────────
  @Get('blocks')
  blocks(@CurrentUser() user: JwtUser) {
    return this.social.listBlocks(user.sub);
  }

  @Post('block')
  block(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const { handle, userId } = parseOrThrow(
      z.object({ handle: z.string().optional(), userId: z.string().optional() }),
      body,
    );
    return this.social.block(user.sub, userId ?? handle ?? '');
  }

  @Delete('block/:userId')
  unblock(@CurrentUser() user: JwtUser, @Param('userId') userId: string) {
    return this.social.unblock(user.sub, userId);
  }

  @Post('report')
  report(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const dto = parseOrThrow(
      z.object({
        targetType: z.enum(['user', 'post', 'comment']),
        targetId: z.string().min(1),
        reason: z.string().max(500).optional(),
      }),
      body,
    );
    return this.social.report(user.sub, dto);
  }
}
