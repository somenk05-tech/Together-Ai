import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { BeautyService } from './beauty.service';
import { PlaceBeautyOrderSchema, type PlaceBeautyOrderDto } from './dto/beauty.dto';

@Controller('beauty')
@UseGuards(JwtAuthGuard)
export class BeautyController {
  constructor(private readonly beauty: BeautyService) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.beauty.getProfile(user.sub);
  }

  // Full skin & hair profile (rich payload); saving generates the one-time assessment.
  @Put('profile')
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: Record<string, unknown>) {
    return this.beauty.saveProfile(user.sub, dto);
  }

  // One-time photo assessment (vision when configured; profile-based otherwise).
  @Post('photos/analyze')
  analyzePhotos(@CurrentUser() user: JwtUser, @Body() dto: { photos?: { slot: string; base64: string; mediaType?: string }[]; thumb?: string }) {
    return this.beauty.analyzePhotos(user.sub, dto?.photos ?? [], dto?.thumb);
  }

  // Permanent skin & hair timeline: every dated assessment + latest-vs-previous comparison.
  // Delete the latest photo check-in so a fresh set can be uploaded.
  @Delete('assessments/latest')
  deleteLatest(@CurrentUser() user: JwtUser) {
    return this.beauty.deleteLatestAssessment(user.sub);
  }

  @Get('history')
  history(@CurrentUser() user: JwtUser) {
    return this.beauty.beautyHistory(user.sub);
  }

  @Get('insights')
  insights(@CurrentUser() user: JwtUser) {
    return this.beauty.insights(user.sub);
  }

  // Makeup Studio — face-first personal makeup artist (no biomarkers).
  @Get('makeup')
  makeup(@CurrentUser() user: JwtUser, @Query('occasion') occasion?: string) {
    return this.beauty.makeupLook(user.sub, occasion);
  }

  @Get('products')
  products(@CurrentUser() user: JwtUser) {
    return this.beauty.products(user.sub);
  }

  @Get('orders')
  orders(@CurrentUser() user: JwtUser) {
    return this.beauty.orders(user.sub);
  }

  @Post('orders')
  @UsePipes(new ZodValidationPipe(PlaceBeautyOrderSchema))
  placeOrder(@CurrentUser() user: JwtUser, @Body() dto: PlaceBeautyOrderDto) {
    return this.beauty.placeOrder(user.sub, dto);
  }
}
