import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { AstrologyService, AskDto, SaveAstroProfileDto } from './astrology.service';
import { TarotService, type DrawSpreadDto } from './tarot.service';

import { Mira } from '../mira/mira.decorator';
import { UNDER_AGE_CITY_MESSAGE, refuseDateOfBirth } from '../shared/age';
import { Throttle } from '@nestjs/throttler';
import { MODEL_LIMIT } from '../shared/throttles';
const SaveProfileSchema = z.object({
  // 18+ HERE TOO. This date is synced to the master profile and fans out to
  // every hub that reads a birthday, so a chart is a way to write one. In the
  // schema as well as in the service: the schema names the FIELD, which is what
  // puts the error under the input the citizen typed into.
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((d) => refuseDateOfBirth(d) === null, { message: UNDER_AGE_CITY_MESSAGE }),
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
  @Mira({
    intent: 'Read the citizen’s own reading for today',
    utterances: ['how is my day going to be', 'how is my day', 'how will my day be', 'what is my day like', 'my reading today', 'todays reading', 'my horoscope', 'todays horoscope', 'what do the stars say', 'read my day', 'anything I should watch out for today'],
    risk: 'R0',
  })
  @Get('daily')
  @Throttle(MODEL_LIMIT)
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
  @Throttle(MODEL_LIMIT)
  monthly(@CurrentUser() user: JwtUser) {
    return this.astrology.monthly(user.sub);
  }

  /** Saved monthly letters (the last two years of them). */
  @Get('monthly/history')
  monthlyHistory(@CurrentUser() user: JwtUser) {
    return this.astrology.monthlyHistory(user.sub);
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
  @Throttle(MODEL_LIMIT)
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
  @Mira({
    intent: 'Name the stone the citizen’s chart calls for',
    utterances: ['which stone should I wear', 'my gemstone', 'what gem is right for me', 'my stone'],
    risk: 'R0',
  })
  @Get('gems')
  gems(@CurrentUser() user: JwtUser) {
    return this.astrology.gems(user.sub);
  }

  /** GET /api/astrology/gemstones — the stones this chart calls for, and how
   *  each is traditionally worn: finger, hand, metal and day. */
  @Get('gemstones')
  gemstones(@CurrentUser() user: JwtUser) {
    return this.astrology.gemstones(user.sub);
  }

  /**
   * GET /api/astrology/gem-catalog — every stone the city sells, with the range
   * each is customarily worn at and what it costs across that range.
   *
   * NO CHART IS READ AND NO PROFILE IS REQUIRED, which is the difference
   * between this and `gemstones` above. That one answers "which stone is mine";
   * this one answers "what do you have". A citizen with no birth details can
   * browse the counter, and nothing on it is ranked for them.
   */
  @Get('gem-catalog')
  gemCatalog() {
    return this.astrology.gemCatalog();
  }

  /** GET /api/astrology/gemstones/:id/design — one stone, sized and priced for
   *  this citizen, with every shape, setting and size judged for its planet. */
  @Get('gemstones/:id/design')
  gemDesign(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.astrology.gemDesign(user.sub, id);
  }

  /** GET /api/astrology/gemstones/:id/metals — what the metal costs for this
   *  design at this size. Its own endpoint because it depends on both. */
  @Get('gemstones/:id/metals')
  gemMetals(@CurrentUser() user: JwtUser, @Param('id') id: string, @Query() qs: Record<string, string>) {
    const schema = z.object({
      worn: z.enum(['ring', 'pendant']),
      design: z.string().min(1).max(40),
      size: z.coerce.number().int().min(1).max(40).default(16),
    });
    const q = schema.parse(qs);
    return this.astrology.gemMetals(user.sub, id, q.worn, q.design, q.size);
  }

  /** GET /api/astrology/gem-cart — every locked commission, priced now. */
  @Get('gem-cart')
  gemCart(@CurrentUser() user: JwtUser) {
    return this.astrology.gemCart(user.sub);
  }

  /** PUT /api/astrology/gem-cart — lock one configuration from the studio. */
  @Put('gem-cart')
  lockGem(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const schema = z.object({
      gemId: z.string().min(1).max(60),
      worn: z.enum(['ring', 'pendant', 'loose']),
      shape: z.string().min(1).max(40),
      setting: z.string().min(1).max(40).optional(),
      style: z.string().min(1).max(40).optional(),
      size: z.number().int().min(1).max(40).optional(),
      metal: z.enum(['gold22', 'silver', 'panchdhatu']).optional(),
      grade: z.number().min(0).max(100),
      /* THE WEIGHT, WHEN THE CITIZEN CHOSE ONE. Absent from anything the studio
         locks — a prescription reads its carats off the chart — and present on
         everything bought at the open market's counter. The bound here is a
         sanity bound, not the real one: `chosenWeight` holds the figure inside
         the STONE's customary range at pricing time, and it is the only place
         that knows which stone this is. */
      carats: z.number().positive().max(60).optional(),
    });
    return this.astrology.lockGem(user.sub, { ...schema.parse(body), addedAt: new Date().toISOString() });
  }

  /** DELETE /api/astrology/gem-cart/:gemId — take one back out. */
  @Delete('gem-cart/:gemId')
  unlockGem(@CurrentUser() user: JwtUser, @Param('gemId') gemId: string) {
    return this.astrology.unlockGem(user.sub, gemId);
  }

  /** POST /api/astrology/gem-cart/quote — ask a person to price what is
   *  locked against the supplier's rates (owner, 5 Sep). Nothing is charged. */
  @Post('gem-cart/quote')
  requestGemQuote(@CurrentUser() user: JwtUser) {
    return this.astrology.requestGemQuote(user.sub);
  }

  /** GET /api/astrology/remedies — practices for this period, health-filtered. */
  @Mira({
    intent: 'List the practices the citizen’s chart suggests',
    utterances: ['what remedies', 'what should I do for my chart', 'my remedies', 'my practices'],
    risk: 'R0',
  })
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

  @Mira({
    intent: 'Draw the citizen’s card for today',
    utterances: ['my card today', 'draw me a card', 'tarot', 'pull a card'],
    risk: 'R0',
  })
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
