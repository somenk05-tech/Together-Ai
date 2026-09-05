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

/** Same rule as a moderation decision: a reason long enough to be a sentence.
 *  Suspending somebody's account on the word "spam" is not a record anybody
 *  can defend three months later. */
const SuspendSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(8).max(1000),
});
type SuspendDto = z.infer<typeof SuspendSchema>;

/**
 * A verification decision. Same reason rule as everything else in here — and
 * it matters more, because on a refusal this exact sentence is what the owner
 * is shown. "invalid" is not something a person can act on.
 */
const VerifySchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  reason: z.string().trim().min(8).max(1000),
  /** Which submission the verdict is about — the document (default) or the
   *  owner's video. One queue, two kinds of evidence. */
  kind: z.enum(['doc', 'video']).optional(),
});
type VerifyDto = z.infer<typeof VerifySchema>;

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

  /** Businesses that have sent a document. Needs business.verify, not
   *  business.read — the row carries a registration number and a certificate. */
  @Get('verification')
  verificationQueue(@CurrentUser() user: JwtUser) {
    return this.admin.verificationQueue(user.sub);
  }

  @Post('verification/:listingId/decision')
  @UsePipes(new ZodValidationPipe(VerifySchema))
  decideVerification(
    @CurrentUser() user: JwtUser,
    @Param('listingId') listingId: string,
    @Body() dto: VerifyDto,
    @Req() req: { ip?: string },
  ) {
    return this.admin.decideVerification(user.sub, listingId, dto.decision, dto.reason, req.ip ?? null, dto.kind ?? 'doc');
  }

  // Declared before ':id'-shaped routes for the usual reason, and named in
  // the plural so "citizens" can never be read as a citizen id.
  @Get('citizens')
  citizens(
    @CurrentUser() user: JwtUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.citizens(user.sub, { query: q, status, cursor, limit: limit ? Number(limit) : undefined });
  }

  // Declared before ':id', or "export" is read as a citizen id.
  @Get('citizens/export')
  exportCitizens(@CurrentUser() user: JwtUser, @Query('reason') reason?: string) {
    return this.admin.citizensCsv(user.sub, reason ?? '');
  }

  /**
   * `unmask=1` asks for the real email and phone. It is granted only to a
   * caller holding users.contact, it writes an audit row when it is, and a
   * caller without the permission gets the masked record rather than a 403 —
   * refusing would turn the option into a probe for who holds what.
   */
  @Get('citizens/:id')
  citizen(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('unmask') unmask?: string,
    @Query('reason') reason?: string,
  ) {
    return this.admin.citizen(user.sub, id, { unmask: unmask === '1', reason });
  }

  @Get('citizens/:id/activity')
  activity(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.admin.activity(user.sub, id);
  }

  @Post('citizens/:id/suspension')
  @UsePipes(new ZodValidationPipe(SuspendSchema))
  suspend(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SuspendDto,
    @Req() req: { ip?: string },
  ) {
    return this.admin.setSuspended(user.sub, id, dto.suspended, dto.reason, req.ip ?? null);
  }

  @Get('businesses/:id')
  business(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.admin.business(user.sub, id);
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
