import { Body, Controller, Get, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { FitnessService } from './fitness.service';
import { SupplementsService } from './supplements/supplements.service';
import { Mira } from '../mira/mira.decorator';
import {
  SaveFitnessProfileSchema, type SaveFitnessProfileDto,
  LogWorkoutSchema, type LogWorkoutDto,
} from './dto/fitness.dto';

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
}
