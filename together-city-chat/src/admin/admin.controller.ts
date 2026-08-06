import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { AdminService } from './admin.service';

const DecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'removed']),
  // Required, and long enough to be a sentence. A one-word reason is a field
  // somebody filled in to get past a field.
  reason: z.string().trim().min(8).max(1000),
});
type DecisionDto = z.infer<typeof DecisionSchema>;

/**
 * The console's surface. Every route below is behind a permission — the guard
 * is in AdminAccessService and it reads the grants table, so a role revoked a
 * minute ago is a role gone a minute ago.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** What this person may do. The screen hides what they cannot; the guard is
   *  what actually stops them. */
  @Get('me')
  me(@CurrentUser() user: JwtUser) { return this.admin.me(user.sub); }

  @Get('queue')
  queue(@CurrentUser() user: JwtUser) { return this.admin.queue(user.sub); }

  @Post('queue/:id/decision')
  @UsePipes(new ZodValidationPipe(DecisionSchema))
  decide(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @Req() req: { ip?: string },
  ) {
    return this.admin.decide(user.sub, id, dto.decision, dto.reason, req.ip ?? null);
  }

  @Get('audit')
  audit(
    @CurrentUser() user: JwtUser,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.admin.audit(user.sub, { entity, entityId, actorId });
  }
}
