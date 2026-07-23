import { Body, Controller, Get, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { AstrologyService, AskDto, SaveAstroProfileDto } from './astrology.service';

const SaveProfileSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)').nullable().optional(),
  birthCountry: z.string().min(2).max(60),
  birthState: z.string().max(60).optional().nullable(),
  birthCity: z.string().min(1).max(80),
  timeZone: z.string().min(3).max(60),
});

const AskSchema = z.object({
  topic: z.string().min(2).max(40),
  question: z.string().min(10).max(600),
  method: z.enum(['wallet', 'card']).optional(),
});

@Controller('astrology')
@UseGuards(JwtAuthGuard)
export class AstrologyController {
  constructor(private readonly astrology: AstrologyService) {}

  /** Shared birth profile (auto-seeded from dating details when present). */
  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.astrology.getProfile(user.sub);
  }

  @Put('profile')
  @UsePipes(new ZodValidationPipe(SaveProfileSchema))
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: SaveAstroProfileDto) {
    return this.astrology.saveProfile(user.sub, dto);
  }

  /** Tab 01 — Today's Horoscope. */
  @Get('daily')
  daily(@CurrentUser() user: JwtUser) {
    return this.astrology.daily(user.sub);
  }

  /** Saved daily predictions (last 30 days on the profile). */
  @Get('daily/history')
  dailyHistory(@CurrentUser() user: JwtUser) {
    return this.astrology.dailyHistory(user.sub);
  }

  /** Tab 02 — Monthly Horoscope (premium long-form). */
  @Get('monthly')
  monthly(@CurrentUser() user: JwtUser) {
    return this.astrology.monthly(user.sub);
  }

  /** Tab 03 — Ask the Astrologer (₹75, charged to the city wallet/card). */
  @Post('ask')
  @UsePipes(new ZodValidationPipe(AskSchema))
  ask(@CurrentUser() user: JwtUser, @Body() dto: AskDto) {
    return this.astrology.ask(user.sub, dto);
  }

  /** My Questions — saved consultations. */
  @Get('questions')
  questions(@CurrentUser() user: JwtUser) {
    return this.astrology.questions(user.sub);
  }
}
