import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { FoodJournalService } from './food-journal.service';
import {
  AnalyzeMealSchema, type AnalyzeMealDto,
  LogMealSchema, type LogMealDto,
  UpdateMealSchema, type UpdateMealDto,
} from './dto/food-journal.dto';

/** AI Food Journal — Nutrition · 06. See FoodJournalService for the rules. */
@Controller('nutrition/journal')
@UseGuards(JwtAuthGuard)
export class FoodJournalController {
  constructor(private readonly journal: FoodJournalService) {}

  /** Identify + estimate. Writes nothing — the citizen reviews first. */
  @Post('analyze')
  @UsePipes(new ZodValidationPipe(AnalyzeMealSchema))
  analyze(@CurrentUser() user: JwtUser, @Body() dto: AnalyzeMealDto) {
    return this.journal.analyze(user.sub, dto);
  }

  /** Log the reviewed meal. Totals recomputed server-side. */
  @Post()
  @UsePipes(new ZodValidationPipe(LogMealSchema))
  log(@CurrentUser() user: JwtUser, @Body() dto: LogMealDto) {
    return this.journal.log(user.sub, dto);
  }

  /** One day: timeline, totals, targets, coach. Defaults to today (their tz). */
  @Get()
  day(@CurrentUser() user: JwtUser, @Query('date') date?: string) {
    return this.journal.day(user.sub, date);
  }

  /** The last seven days for the trend strip. */
  @Get('week')
  week(@CurrentUser() user: JwtUser) {
    return this.journal.week(user.sub);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(UpdateMealSchema))
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateMealDto) {
    return this.journal.update(user.sub, id, dto.items);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.journal.remove(user.sub, id);
  }
}
