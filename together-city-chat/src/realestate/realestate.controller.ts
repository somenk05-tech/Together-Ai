import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { RealEstateService } from './realestate.service';
import { PostPropertySchema, type PostPropertyDto, ListingQuerySchema, type ListingQueryDto } from './dto/realestate.dto';
import { Throttle } from '@nestjs/throttler';
import { MODEL_LIMIT } from '../shared/throttles';

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
  @Throttle(MODEL_LIMIT)
  @UsePipes(new ZodValidationPipe(PostPropertySchema))
  post(@CurrentUser() user: JwtUser, @Body() dto: PostPropertyDto) {
    return this.realestate.post(user.sub, dto);
  }

  // Edit a listing (owner only). The edited content re-runs moderation, so a
  // clean edit is live again immediately and a dirty one reads its reasons.
  @Put('properties/:id')
  @Throttle(MODEL_LIMIT)
  @UsePipes(new ZodValidationPipe(PostPropertySchema))
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PostPropertyDto) {
    return this.realestate.update(user.sub, id, dto);
  }

  // Close a listing (owner only): sold / rented / withdrawn. The row stays in
  // My Listings; Explore and strangers stop seeing it. Edit & save relists.
  @Delete('properties/:id')
  close(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.realestate.close(user.sub, id);
  }

  // Connect with the seller: opens (or reuses) a direct chat carrying the
  // listing as a rich card. Free — see RealEstateService.enquire.
  @Post('properties/:id/enquire')
  @UsePipes(new ZodValidationPipe(z.object({ message: z.string().max(600).optional() })))
  enquire(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: { message?: string }) {
    return this.realestate.enquire(user.sub, id, body.message);
  }

  // ─── moderation (console: moderation.read to see the queue, moderation.act
  //     to decide — the same AdminGrant permissions the rest of the city uses) ───
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
