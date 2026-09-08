import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { BabyCareService } from './babycare.service';

/**
 * ── THE BABY CARE DISTRICT'S ROUTES ─────────────────────────────────────────
 *
 * Four of them, and every one is the caller's own child. There is no route here
 * that takes somebody else's id and no route that lists anybody but the citizen
 * who asked. That is the Pet District's rule and it matters more here: a child's
 * name and date of birth are the two facts an impersonation is built out of.
 *
 * THE CATALOGUE IS NOT BEHIND THIS CONTROLLER, and deliberately. It is 323 rows
 * of public retail data that changes when somebody re-reads the shops, not when
 * a citizen does anything, so it ships in the web bundle where it is cached with
 * the build. When it grows past what a bundle should carry, `features/babycare/
 * api.ts` is already shaped like the call that replaces it.
 */

/** A date that exists. The band the whole district reads is derived from this,
 *  so a February 31st here is a wrong shelf, silently, until the child is ten.
 *  The same check the Pet District puts on an animal's birthday. */
const DOB = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a YYYY-MM-DD date')
  .refine((d) => {
    const [y, m, day] = d.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, day));
    return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === day;
  }, 'a date that exists');

/**
 * NULLABLE RATHER THAN OPTIONAL, and the difference is the whole point: a
 * parent who would rather not put a child's birthday into an application must
 * be able to CLEAR one they already gave. `undefined` means "I am not changing
 * it" and `null` means "take it out"; the service tells them apart.
 */
const ChildSchema = z.object({
  name: z.string().trim().min(1).max(60),
  dob: DOB.nullable().optional(),
  /** The parent's own words. STORED AND NEVER INTERPRETED — nothing on either
   *  side of this wire reads it, and the form says so where a parent can see
   *  it. A store that filtered a catalogue on this sentence would be making a
   *  clinical decision out of a text box. */
  notes: z.string().max(2000).optional(),
});

const ChildPatchSchema = ChildSchema.partial();

@Controller('babycare')
@UseGuards(JwtAuthGuard)
export class BabyCareController {
  constructor(private readonly svc: BabyCareService) {}

  @Get('children')
  list(@CurrentUser() user: JwtUser) {
    return this.svc.list(user.sub);
  }

  @Post('children')
  @UsePipes(new ZodValidationPipe(ChildSchema))
  create(@CurrentUser() user: JwtUser, @Body() body: z.infer<typeof ChildSchema>) {
    return this.svc.create(user.sub, body);
  }

  @Patch('children/:id')
  @UsePipes(new ZodValidationPipe(ChildPatchSchema))
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: z.infer<typeof ChildPatchSchema>,
  ) {
    return this.svc.update(user.sub, id, body);
  }

  @Delete('children/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.svc.remove(user.sub, id);
  }
}
