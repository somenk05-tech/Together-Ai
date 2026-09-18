import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../shared/current-user.decorator';
import { JwtUser } from '../../shared/types';
import { ZodValidationPipe } from '../../shared/zod/zod-validation.pipe';
import { Room } from '../../dev/room.decorator';
import { LibraryService } from './library.service';
import { SaveWorkoutPlanSchema, type SaveWorkoutPlanDto } from './library.dto';

/**
 * /api/fitness/library — every movement in the city, and the citizen's own
 * plans built from it (owner, 18 Sep). Its own controller beside
 * fitness.controller.ts because it is its own room on the rail
 * (03 · Workout Library) with its own switch on /dev, and none of these
 * routes touch the session, the month or the log.
 */
@Controller('fitness/library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly lib: LibraryService) {}

  @Room('/fitness/library')
  @Get()
  library(@CurrentUser() user: JwtUser) {
    return this.lib.library(user.sub);
  }

  @Room('/fitness/library')
  @Get('plans')
  plans(@CurrentUser() user: JwtUser) {
    return this.lib.plans(user.sub);
  }

  @Room('/fitness/library')
  @Post('plans')
  @UsePipes(new ZodValidationPipe(SaveWorkoutPlanSchema))
  savePlan(@CurrentUser() user: JwtUser, @Body() dto: SaveWorkoutPlanDto) {
    return this.lib.savePlan(user.sub, dto);
  }

  @Room('/fitness/library')
  @Patch('plans/:id')
  updatePlan(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body(new ZodValidationPipe(SaveWorkoutPlanSchema)) dto: SaveWorkoutPlanDto) {
    return this.lib.updatePlan(user.sub, id, dto);
  }

  @Room('/fitness/library')
  @Delete('plans/:id')
  deletePlan(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.lib.deletePlan(user.sub, id);
  }

  /** How one movement is done — read when a card is opened, not before. */
  @Room('/fitness/library')
  @Get(':id')
  movement(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.lib.movement(user.sub, id);
  }
}
