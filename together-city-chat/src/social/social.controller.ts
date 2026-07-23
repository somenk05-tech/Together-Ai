import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  @Post('posts')
  @UsePipes(new ZodValidationPipe(CreatePostSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePostDto) {
    return this.social.createPost(user.sub, dto);
  }

  @Delete('posts/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.social.deletePost(user.sub, id);
  }

  @Get('posts/:id/comments')
  comments(@Param('id') id: string) {
    return this.social.comments(id);
  }

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
}
