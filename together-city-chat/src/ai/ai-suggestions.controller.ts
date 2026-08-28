import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { AiSuggestionsService } from './ai-suggestions.service';
import { Throttle } from '@nestjs/throttler';
import { MODEL_LIMIT } from '../shared/throttles';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiSuggestionsController {
  constructor(private readonly ai: AiSuggestionsService) {}

  @Get('recipes')
  @Throttle(MODEL_LIMIT)
  recipes(@CurrentUser() user: JwtUser) {
    return this.ai.recipes(user.sub);
  }

  @Get('astrology')
  @Throttle(MODEL_LIMIT)
  astrology(@CurrentUser() user: JwtUser) {
    return this.ai.astrology(user.sub);
  }

  @Get('beauty')
  @Throttle(MODEL_LIMIT)
  beauty(@CurrentUser() user: JwtUser) {
    return this.ai.beauty(user.sub);
  }

  @Get('fitness')
  @Throttle(MODEL_LIMIT)
  fitness(@CurrentUser() user: JwtUser) {
    return this.ai.fitness(user.sub);
  }
}
