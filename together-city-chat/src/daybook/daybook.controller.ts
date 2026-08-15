import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { DaybookService } from './daybook.service';

/**
 * The daybook's routes. Every one of them is the citizen's own day — there is
 * no route here that takes somebody else's id, because there is no reading of
 * this data that is anybody else's business.
 */

/** YYYY-MM-DD, and it must be a real one: '2026-02-31' is not a day. */
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a YYYY-MM-DD date')
  .refine((d) => {
    const [y, m, day] = d.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, day));
    return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === day;
  }, 'a date that exists');

/** The kinds a line can be. A string in the database (see the model), a list
 *  here — so the API is honest about what it accepts today without a migration
 *  standing between the product and the next kind. */
const KIND = z.enum(['task', 'meeting', 'reminder', 'appointment']);

/** HH:MM, 24-hour, in the citizen's own clock. */
const AT = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a HH:MM time');

export const SaveDaySchema = z.object({
  mood: z.string().max(40).nullable().optional(),
  feelNote: z.string().max(2000).nullable().optional(),
  journal: z.string().max(20000).nullable().optional(),
});
export const AddItemSchema = z.object({
  kind: KIND.default('task'),
  title: z.string().min(1).max(300),
  at: AT.nullable().optional(),
});
/** What the browser asks for before it uploads, and what it files afterwards.
 *  The key is checked against the citizen's own namespace in the service — a
 *  string that arrives from a client is never proof of anything on its own. */
export const PresignPhotoSchema = z.object({
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});
export const AddPhotoSchema = z.object({
  fileKey: z.string().min(1).max(300),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export const PatchItemSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).max(300).optional(),
  at: AT.nullable().optional(),
  kind: KIND.optional(),
});

@Controller('daybook')
@UseGuards(JwtAuthGuard)
export class DaybookController {
  constructor(private readonly daybook: DaybookService) {}

  /** One day, as they left it. */
  @Get(':date')
  day(@CurrentUser() user: JwtUser, @Param('date') date: string) {
    return this.daybook.day(user.sub, DATE.parse(date));
  }

  /** The page — mood, the line behind it, the writing. Partial: see the service. */
  @Put(':date')
  @UsePipes(new ZodValidationPipe(SaveDaySchema))
  save(@CurrentUser() user: JwtUser, @Param('date') date: string, @Body() dto: z.infer<typeof SaveDaySchema>) {
    return this.daybook.save(user.sub, DATE.parse(date), dto);
  }

  @Post(':date/items')
  @UsePipes(new ZodValidationPipe(AddItemSchema))
  add(@CurrentUser() user: JwtUser, @Param('date') date: string, @Body() dto: z.infer<typeof AddItemSchema>) {
    return this.daybook.add(user.sub, DATE.parse(date), dto);
  }

  @Patch('items/:id')
  @UsePipes(new ZodValidationPipe(PatchItemSchema))
  patch(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: z.infer<typeof PatchItemSchema>) {
    return this.daybook.update(user.sub, id, dto);
  }

  @Delete('items/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.daybook.remove(user.sub, id);
  }

  /**
   * A PICTURE ON A DAY, IN TWO STEPS.
   *
   * `photos/presign` hands back a URL the browser PUTs the bytes to directly —
   * the file never passes through this API — and then `:date/photos` files the
   * key it was given. Two calls rather than one upload endpoint, which is how
   * every other private picture in the city is stored, and the reason is that
   * the bytes go browser→vault: nothing here has to hold a photograph in
   * memory, and nothing here can accidentally log one.
   *
   * `photos/presign` is declared before the `:date/…` routes as a matter of
   * habit rather than necessity — no `:date` route has `photos` as its second
   * segment — but the day somebody adds `@Post(':date/presign')` the habit is
   * what stops a citizen's date being read as the word "photos".
   */
  @Post('photos/presign')
  @UsePipes(new ZodValidationPipe(PresignPhotoSchema))
  presignPhoto(@CurrentUser() user: JwtUser, @Body() dto: z.infer<typeof PresignPhotoSchema>) {
    return this.daybook.presignPhoto(user.sub, dto.mimeType, dto.sizeBytes);
  }

  @Post(':date/photos')
  @UsePipes(new ZodValidationPipe(AddPhotoSchema))
  addPhoto(@CurrentUser() user: JwtUser, @Param('date') date: string, @Body() dto: z.infer<typeof AddPhotoSchema>) {
    return this.daybook.addPhoto(user.sub, DATE.parse(date), dto);
  }

  @Delete('photos/:id')
  removePhoto(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.daybook.removePhoto(user.sub, id);
  }

  /**
   * Which days of a month hold something — counts, never contents. The grid
   * shows a mark; reading the day is a second, deliberate act.
   */
  @Get('month/:ym')
  month(@CurrentUser() user: JwtUser, @Param('ym') ym: string) {
    return this.daybook.month(user.sub, z.string().regex(/^\d{4}-\d{2}$/, 'a YYYY-MM month').parse(ym));
  }
}
