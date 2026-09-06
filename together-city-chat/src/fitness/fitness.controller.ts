import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { FitnessService } from './fitness.service';
import { SupplementsService } from './supplements/supplements.service';
import { Mira } from '../mira/mira.decorator';
import {
  EditWorkoutSchema,
  LogWorkoutSchema,
  SaveFitnessProfileSchema,
  TodaySessionQueryDto,
  TodaySessionQuerySchema,
  type EditWorkoutDto,
  type LogWorkoutDto,
  type SaveFitnessProfileDto,
} from './dto/fitness.dto';
import {
  SupplementBagSchema, type SupplementBagDto,
  PlaceSupplementOrderSchema, type PlaceSupplementOrderDto,
  SupplementBudgetSchema, type SupplementBudgetDto,
} from './dto/supplements.dto';

@Controller('fitness')
@UseGuards(JwtAuthGuard)
export class FitnessController {
  constructor(
    private readonly fitness: FitnessService,
    private readonly supplements: SupplementsService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.fitness.getProfile(user.sub);
  }

  @Put('profile')
  @UsePipes(new ZodValidationPipe(SaveFitnessProfileSchema))
  saveProfile(@CurrentUser() user: JwtUser, @Body() dto: SaveFitnessProfileDto) {
    return this.fitness.saveProfile(user.sub, dto);
  }

  @Mira({
    intent: 'Read the citizen’s training plan',
    utterances: ['my workout', 'my training plan', 'what should I train today', 'my exercise plan'],
    risk: 'R0',
  })
  @Get('plan')
  plan(@CurrentUser() user: JwtUser) {
    return this.fitness.plan(user.sub);
  }

  /**
   * GET /api/fitness/session — today's session, built server-side.
   *
   * A GET with two optional overrides rather than a POST: it computes and
   * stores nothing, and "45 minutes, at the gym, today" is a narrowing of a
   * question the profile already answers, not a change to it.
   */
  @Get('session')
  @UsePipes(new ZodValidationPipe(TodaySessionQuerySchema))
  session(@CurrentUser() user: JwtUser, @Query() q: TodaySessionQueryDto) {
    return this.fitness.session(user.sub, q);
  }

  /**
   * GET /api/fitness/programme — the citizen's month with a trainer: 28 days
   * from the day they first opened it, which body part each day is, which
   * movements from the catalogue, in four phases. See programme-engine.ts.
   * Not a Mira capability yet: a capability is a decorator AND an executor
   * branch, and the ledger records the gap between them.
   */
  @Get('programme')
  programme(@CurrentUser() user: JwtUser) {
    return this.fitness.programme(user.sub);
  }

  @Get('body-goal')
  bodyGoal(@CurrentUser() user: JwtUser) {
    return this.fitness.bodyProgram(user.sub);
  }

  @Post('sync-nutrition')
  syncNutrition(@CurrentUser() user: JwtUser) {
    return this.fitness.syncNutrition(user.sub);
  }

  @Mira({
    intent: 'Say how much the citizen has trained',
    utterances: ['how much have I trained', 'my workout log', 'minutes this week', 'have I exercised'],
    risk: 'R0',
  })
  @Get('log')
  log(@CurrentUser() user: JwtUser) {
    return this.fitness.log(user.sub);
  }

  @Post('log')
  @UsePipes(new ZodValidationPipe(LogWorkoutSchema))
  addLog(@CurrentUser() user: JwtUser, @Body() dto: LogWorkoutDto) {
    return this.fitness.addLog(user.sub, dto);
  }

  /**
   * AN ENTRY IS ITS OWNER'S TO CHANGE (owner, 17 Aug). Both routes take the id
   * from the path and the citizen from the token, and the service puts BOTH in
   * the where-clause - the controller never gets to decide whose row this is.
   * Neither is a Mira intent: a voice assistant that can delete a training
   * history on a misheard word is not a feature anybody asked for.
   */
  @Patch('log/:id')
  @UsePipes(new ZodValidationPipe(EditWorkoutSchema))
  editLog(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: EditWorkoutDto) {
    return this.fitness.editLog(user.sub, id, dto);
  }

  @Delete('log/:id')
  removeLog(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.fitness.removeLog(user.sub, id);
  }

  /**
   * THE SUPPLEMENT PLAN — read-only, and READ-ONLY IS THE POINT. There is no
   * route here that takes a dose, a lab value or a supplement id from a client
   * and turns it into a recommendation: everything the engine answers with is
   * derived server-side from the citizen's own hubs and resolved against a
   * cited knowledge base. A POST would be the door through which "recommend me
   * 5,000 IU" eventually arrives.
   *
   * NOT REGISTERED WITH MIRA. Every other reader on this controller carries an
   * @Mira intent so she can answer from it; this one deliberately does not.
   * She is a voice with a levity governor and a fallback line, and the gap
   * between "explain my plan" and "tell me what to take" is one sentence wide
   * when the subject is medicines and blood work. The plan is a screen a
   * citizen reads, with its sources on it, until there is a specific reviewed
   * design for her saying any of it out loud.
   */
  @Get('supplements')
  supplementPlan(@CurrentUser() user: JwtUser) {
    return this.supplements.plan(user.sub);
  }

  /**
   * THE SHELF. Also a GET, also not a Mira reader, and for a sharper reason
   * than the plan route: the sentence "order me the vitamin D" is one word
   * away from working, and an assistant that can put a supplement in a basket
   * is an assistant that can be talked into putting the wrong one there. The
   * store is a place a person walks into with their eyes open.
   *
   * It carries no cart and no checkout because this city does not take the
   * money — every product links to the retailer selling it, at the price the
   * evidence review recorded, with no parameter of ours appended.
   */
  @Get('store')
  supplementStore(@CurrentUser() user: JwtUser) {
    return this.supplements.store(user.sub);
  }

  /**
   * THE MULTIVITAMIN ASSESSMENT. A GET, and not a Mira reader, for the same
   * reason as the other two — but with one of its own on top. Almost every
   * answer this route produces is a refusal with a citation attached, and a
   * refusal read aloud in a friendly voice is the easiest thing in this
   * codebase to turn accidentally into permission.
   *
   * No till, no bag, no product link that takes money. The plan page can sell
   * what it recommends because it can never sell what it refuses; this page is
   * mostly refusals, so it sells nothing at all.
   */
  @Get('multivitamins')
  multivitaminAssessment(@CurrentUser() user: JwtUser) {
    return this.supplements.multivitamins(user.sub);
  }

  /* ── THE TILL ────────────────────────────────────────────────────────────
     Four routes, and the pair of them that matter are GET store/bag and GET
     store/orders. Nutrition once shipped a checkout with neither: it charged
     the wallet, wrote the order and rendered none of it, so a citizen paid and
     had nowhere to look. Every writer below has a reader in the same commit,
     and none of these is a Mira capability — "order me the vitamin D" is one
     sentence away from working, and an assistant that can spend a citizen's
     wallet on a supplement is an assistant that can be talked into spending it
     on the wrong one. */

  @Get('store/bag')
  supplementBag(@CurrentUser() user: JwtUser) {
    return this.supplements.bag(user.sub);
  }

  @Put('store/bag')
  @UsePipes(new ZodValidationPipe(SupplementBagSchema))
  saveSupplementBag(@CurrentUser() user: JwtUser, @Body() dto: SupplementBagDto) {
    return this.supplements.saveBag(user.sub, dto.lines);
  }

  /**
   * THE BUDGET FOR THE KIT — the one number the citizen sets on this shelf.
   * A PUT of the whole value (null clears it), not a Mira capability: "spend
   * less on supplements" is a sentence, and a cap is a decision.
   */
  @Put('store/budget')
  @UsePipes(new ZodValidationPipe(SupplementBudgetSchema))
  setSupplementBudget(@CurrentUser() user: JwtUser, @Body() dto: SupplementBudgetDto) {
    return this.supplements.setBudget(user.sub, dto.monthlyInr);
  }

  @Get('store/orders')
  supplementOrders(@CurrentUser() user: JwtUser) {
    return this.supplements.orders(user.sub);
  }

  @Post('store/orders')
  @UsePipes(new ZodValidationPipe(PlaceSupplementOrderSchema))
  placeSupplementOrder(@CurrentUser() user: JwtUser, @Body() dto: PlaceSupplementOrderDto) {
    return this.supplements.placeOrder(user.sub, dto);
  }
}
