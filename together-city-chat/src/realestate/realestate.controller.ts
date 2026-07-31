import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { RealEstateService } from './realestate.service';
import { PostPropertySchema, type PostPropertyDto, ListingQuerySchema, type ListingQueryDto } from './dto/realestate.dto';

@Controller('realestate')
@UseGuards(JwtAuthGuard)
export class RealEstateController {
  constructor(private readonly realestate: RealEstateService) {}

  @Get('listings')
  @UsePipes(new ZodValidationPipe(ListingQuerySchema))
  listings(@CurrentUser() user: JwtUser, @Query() query: ListingQueryDto) {
    return this.realestate.listings(query, user.sub);
  }

  @Get('under-construction')
  underConstruction(@CurrentUser() user: JwtUser) {
    return this.realestate.underConstruction(user.sub);
  }

  @Get('my-listings')
  myListings(@CurrentUser() user: JwtUser) {
    return this.realestate.myListings(user.sub);
  }

  @Get('properties/:id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.realestate.detail(id, user.sub);
  }

  // Publishing a property listing is public-facing → requires a confirmed email.
  @Post('properties')
  @UsePipes(new ZodValidationPipe(PostPropertySchema))
  post(@CurrentUser() user: JwtUser, @Body() dto: PostPropertyDto) {
    return this.realestate.post(user.sub, dto);
  }

  // ─── moderation (admin only; gated by MODERATION_ADMINS handles) ───
  @Get('moderation/queue')
  moderationQueue(@CurrentUser() user: JwtUser) {
    return this.realestate.moderationQueue(user.sub);
  }

  @Post('moderation/:id/decision')
  @UsePipes(new ZodValidationPipe(z.object({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().max(500).optional(),
  })))
  moderationDecide(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: { decision: 'approved' | 'rejected'; reason?: string }) {
    return this.realestate.moderationDecide(user.sub, id, body.decision === 'rejected' ? 'rejected' : 'approved', (body.reason ?? '').slice(0, 500));
  }
}
