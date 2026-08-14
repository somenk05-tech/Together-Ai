import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MiraService } from './mira.service';
import { manifest } from './manifest';

export const AskSchema = z.object({
  text: z.string().min(1).max(2000),
  /** Their local hour, sent by the client — the server's clock is the wrong one. */
  hour: z.number().int().min(0).max(23).optional(),
  weeksKnown: z.number().int().min(0).max(520).optional(),
  dial: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  distressLocked: z.boolean().optional(),
  recent: z.array(z.string().max(2000)).max(3).optional(),
});
export type AskDto = z.infer<typeof AskSchema>;

@Controller('mira')
@UseGuards(JwtAuthGuard)
export class MiraController {
  constructor(private readonly mira: MiraService) {}

  /**
   * What Mira can do, generated from the decorators.
   *
   * In the product because it is the honest answer to "what can she do?" — and
   * because a generated list is the only kind that stays true.
   */
  @Get('capabilities')
  capabilities() {
    return manifest().map(({ id, intent, risk, path }) => ({ id, intent, risk, path }));
  }

  @Post('ask')
  @UsePipes(new ZodValidationPipe(AskSchema))
  ask(@CurrentUser() user: JwtUser, @Body() dto: AskDto) {
    return this.mira.ask(dto.text, {
      userId: user.sub,
      hour: dto.hour ?? 12,
      weeksKnown: dto.weeksKnown ?? 0,
      dial: dto.dial,
      distressLocked: dto.distressLocked,
      recent: dto.recent,
    });
  }
}
