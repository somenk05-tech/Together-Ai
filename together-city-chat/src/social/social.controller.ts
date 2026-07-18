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
  map() {
    return this.social.map();
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
