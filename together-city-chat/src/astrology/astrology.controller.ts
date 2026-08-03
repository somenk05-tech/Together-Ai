import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { AstrologyService, AskDto, SaveAstroProfileDto } from './astrology.service';
import { TarotService, type DrawSpreadDto } from './tarot.service';

const SaveProfileSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)').nullable().optional(),
  birthCountry: z.string().min(2).max(60),
  birthState: z.string().max(60).optional().nullable(),
  birthCity: z.string().min(1).max(80),
  timeZone: z.string().min(3).max(60),
});

/**
 * A spread is drawn from cards the citizen turned, so the picks are required.
 *
 * The bounds here are the widest any spread uses; the exact count and the exact
 * table size are checked in the service against the spread actually asked for,
 * because only it knows that a Celtic Cross has ten positions and a wider table
 * than Past·Present·Future. A schema that hard-coded either would be a second
 * opinion about a number the service owns.
 */
const DrawSpreadSchema = z.object({
  kind: z.enum(['three', 'celtic']),
  question: z.string().min(5).max(300),
  picks: z.array(
    z.number({ required_error: 'Turn the cards before the reading is drawn.' })
      .int().min(0).max(TarotService.MAX_FAN - 1),
    { required_error: 'Turn the cards before the reading is drawn.' },
  ).min(1, 'Turn the cards before the reading is drawn.').max(10),
  method: z.enum(['wallet', 'card']).optional(),
});

const AskSchema = z.object({
  topic: z.string().min(2).max(40),
  question: z.string().min(10).max(600),
  method: z.enum(['wallet', 'card']).optional(),
});

@Controller('astrology')
@UseGuards(JwtAuthGuard)
export class AstrologyController {
  constructor(
    private readonly astrology: AstrologyService,
    private readonly tarot: TarotService,
  ) {}

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

  /**
   * What the next consultation costs, before anybody writes one.
   *
   * A GET on the same path the question is POSTed to, because it is the same
   * subject: the state of asking. The screen needs this before the citizen
   * types — a price discovered after the button is pressed is an ambush, and
   * the whole reason the counter is readable is so that it never is one.
   */
  @Get('ask')
  askQuota(@CurrentUser() user: JwtUser) {
    return this.astrology.askQuota(user.sub);
  }

  /** Tab 03 — Ask the Astrologer. Five free, then ₹100 for the next five. */
  @Post('ask')
  @UsePipes(new ZodValidationPipe(AskSchema))
  ask(@CurrentUser() user: JwtUser, @Body() dto: AskDto) {
    return this.astrology.ask(user.sub, dto);
  }

  /** Delete one saved consultation. Really delete it — see the service. */
  @Delete('questions/:id')
  deleteQuestion(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.astrology.deleteQuestion(user.sub, id);
  }

  /** My Questions — saved consultations. */
  @Get('questions')
  questions(@CurrentUser() user: JwtUser) {
    return this.astrology.questions(user.sub);
  }

  // ─────────────── Tarot ───────────────
  /** What each spread deals and costs — drives the picker. */
  /** GET /api/astrology/gems — the stone for this period, and one supporting it. */
  @Get('gems')
  gems(@CurrentUser() user: JwtUser) {
    return this.astrology.gems(user.sub);
  }

  /** GET /api/astrology/remedies — practices for this period, health-filtered. */
  @Get('remedies')
  remedies(@CurrentUser() user: JwtUser) {
    return this.astrology.remedies(user.sub);
  }

  @Get('tarot/spreads')
  tarotSpreads() {
    return this.tarot.spreads();
  }

  /** Card of the Day — free, one card, stable for the citizen's whole day. */
  /**
   * Turn one of today's face-down cards.
   *
   * The bound comes from the service rather than a literal, because the number
   * of cards on the table is one fact and a route that disagrees with it would
   * accept a choice nobody was offered.
   */
  @Post('tarot/daily/choose')
  @UsePipes(new ZodValidationPipe(z.object({
    position: z.number().int().min(0).max(TarotService.DAILY_FAN - 1),
  })))
  tarotChooseDaily(@CurrentUser() user: JwtUser, @Body() body: { position: number }) {
    return this.tarot.chooseDailyCard(user.sub, body.position);
  }

  @Get('tarot/daily')
  tarotDaily(@CurrentUser() user: JwtUser) {
    return this.tarot.dailyCard(user.sub);
  }

  /** A paid spread drawn against a question. */
  @Post('tarot/draw')
  @UsePipes(new ZodValidationPipe(DrawSpreadSchema))
  tarotDraw(@CurrentUser() user: JwtUser, @Body() dto: DrawSpreadDto) {
    return this.tarot.drawSpread(user.sub, dto);
  }

  /**
   * Delete one saved reading. Really delete it — and see the service for the
   * one reading that cannot go, and why.
   */
  @Delete('tarot/:id')
  deleteReading(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.tarot.deleteReading(user.sub, id);
  }

  /** Past readings, newest first. */
  @Get('tarot/history')
  tarotHistory(@CurrentUser() user: JwtUser) {
    return this.tarot.history(user.sub);
  }
}
