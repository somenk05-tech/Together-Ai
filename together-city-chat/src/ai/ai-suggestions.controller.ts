import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { AiSuggestionsService } from './ai-suggestions.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiSuggestionsController {
  constructor(private readonly ai: AiSuggestionsService) {}

  @Get('recipes')
  recipes(@CurrentUser() user: JwtUser) {
    return this.ai.recipes(user.sub);
  }

  @Get('astrology')
  astrology(@CurrentUser() user: JwtUser) {
    return this.ai.astrology(user.sub);
  }

  @Get('beauty')
  beauty(@CurrentUser() user: JwtUser) {
    return this.ai.beauty(user.sub);
  }

  @Get('fitness')
  fitness(@CurrentUser() user: JwtUser) {
    return this.ai.fitness(user.sub);
  }
}
