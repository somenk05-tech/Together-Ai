import { Body, Controller, Get, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { FitnessService } from './fitness.service';
import { Mira } from '../mira/mira.decorator';
import {
  SaveFitnessProfileSchema, type SaveFitnessProfileDto,
  LogWorkoutSchema, type LogWorkoutDto,
} from './dto/fitness.dto';

@Controller('fitness')
@UseGuards(JwtAuthGuard)
export class FitnessController {
  constructor(private readonly fitness: FitnessService) {}

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
}
