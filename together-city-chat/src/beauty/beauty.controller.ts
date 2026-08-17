import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards, UsePipes, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { BeautyService } from './beauty.service';
import { LookAnalysisService } from './look-analysis.service';
import { PlaceBeautyOrderSchema, type PlaceBeautyOrderDto } from './dto/beauty.dto';

import { Mira } from '../mira/mira.decorator';
@Controller('beauty')
@UseGuards(JwtAuthGuard)
export class BeautyController {
  constructor(private readonly beauty: BeautyService,
    private readonly looks: LookAnalysisService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.beauty.getProfile(user.sub);
  }

  // Full skin & hair profile (rich payload); saving generates the one-time assessment.
  @Put('profile')
  @UsePipes(new ZodValidationPipe(
    // Rich questionnaire payload: bounded record of primitives / string lists.
    z.record(
      z.string().max(64),
      z.union([z.string().max(2000), z.number(), z.boolean(), z.null(), z.array(z.string().max(300)).max(50)]),
    ).refine((o) => Object.keys(o).length <= 80, 'too many fields'),
  ))
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: Record<string, unknown>) {
    return this.beauty.saveProfile(user.sub, dto);
  }

  // One-time photo assessment (vision when configured; profile-based otherwise).
  @Post('photos/analyze')
  @UsePipes(new ZodValidationPipe(z.object({
    photos: z.array(z.object({
      slot: z.string().min(1).max(32),
      base64: z.string().min(16).max(4_000_000),
      mediaType: z.string().max(40).regex(/^image\//).optional(),
    })).max(8).optional(),
    thumb: z.string().max(4_000_000).optional(),
  })))
  analyzePhotos(@CurrentUser() user: JwtUser, @Body() dto: { photos?: { slot: string; base64: string; mediaType?: string }[]; thumb?: string }) {
    return this.beauty.analyzePhotos(user.sub, dto?.photos ?? [], dto?.thumb);
  }

  /**
   * The monthly budget, per part of the routine.
   *
   * A GET that can answer "not set". The routine is not generated until this
   * has been said out loud, and a default applied on the citizen's behalf is
   * the one thing the design refuses.
   */
  /** GET /api/beauty/bag — one bag per citizen, priced from the shelf. */
  @Get('bag')
  bag(@CurrentUser() user: JwtUser) {
    return this.beauty.getBag(user.sub);
  }

  /** PUT /api/beauty/bag — replace it wholesale. */
  @Put('bag')
  saveBag(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const schema = z.object({
      lines: z.array(z.object({ id: z.string().min(1), qty: z.number().int().min(0).max(12) })).max(60),
    });
    return this.beauty.saveBag(user.sub, schema.parse(body).lines);
  }

  @Get('budget')
  budget(@CurrentUser() user: JwtUser) {
    return this.beauty.getBudget(user.sub);
  }

  @Put('budget')
  @UsePipes(new ZodValidationPipe(z.object({
    // Clamped again in the service. Validated here so a negative or a string
    // never reaches the planner, and bounded so nobody stores ₹9,000,000.
    // Zero is allowed and means "spend nothing on this part of me" — a real
    // answer, and different from never having set a budget at all.
    // BUDGET_MAX, and the schema says the number rather than importing it on
    // purpose: a zod bound is the contract with the client and it should be
    // readable here. If they drift, budget-is-a-limit.spec.ts fails.
    face: z.number().int().min(0).max(8_000),
    hair: z.number().int().min(0).max(8_000),
    body: z.number().int().min(0).max(8_000),
    preference: z.string().max(200).optional(),
  })))
  saveBudget(@CurrentUser() user: JwtUser, @Body() dto: { face: number; hair: number; body: number; preference?: string }) {
    return this.beauty.saveBudget(user.sub, dto);
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

  /** GET /api/beauty/routine — morning, evening and weekly, in order. */
  @Mira({
    intent: 'Read the citizen’s skincare routine',
    utterances: ['my routine', 'my skincare', 'what do I put on my face', 'my products'],
    risk: 'R0',
  })
  @Get('routine')
  routine(@CurrentUser() user: JwtUser) {
    return this.beauty.routine(user.sub);
  }

  // ─────────────── Makeup reference decode (brief item 23) ───────────────

  /** POST /api/beauty/looks — read a reference photo into steps you can follow. */
  @Post('looks')
  @UsePipes(new ZodValidationPipe(z.object({
    fileKey: z.string().max(300).optional(),
    mimeType: z.string().max(60).regex(/^image\//).optional(),
    base64: z.string().min(16).max(4_000_000).optional(),
  })))
  analyzeLook(@CurrentUser() user: JwtUser, @Body() dto: { fileKey?: string; mimeType?: string; base64?: string }) {
    return this.beauty.analyzeLook(user.sub, dto);
  }

  @Get('looks')
  listLooks(@CurrentUser() user: JwtUser) {
    return this.looks.list(user.sub);
  }

  @Get('looks/:id')
  look(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.looks.get(user.sub, id);
  }

  @Delete('looks/:id')
  removeLook(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.looks.remove(user.sub, id);
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
