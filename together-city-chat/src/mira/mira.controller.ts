import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MiraService } from './mira.service';
import { MiraRegistry } from './mira.registry';

export const AskSchema = z.object({
  text: z.string().min(1).max(2000),
  /** Their local hour, sent by the client — the server's clock is the wrong one. */
  hour: z.number().int().min(0).max(23).optional(),
  weeksKnown: z.number().int().min(0).max(520).optional(),
  dial: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  distressLocked: z.boolean().optional(),
  recent: z.array(z.string().max(2000)).max(3).optional(),
  /** Session counter — picks the mood and which aside she reaches for. Sent by
   *  the client because the mood must hold across a conversation and the server
   *  keeps no session. Not security-relevant: it chooses a tone. */
  seed: z.number().int().min(0).max(1_000_000).optional(),
  /**
   * The options she offered last turn, handed back.
   *
   * This is the whole of her short-term memory, and it rides on the wire rather
   * than living on the server. Without it every turn starts from nothing, a
   * one-word reply goes back through the matcher that produced the question,
   * and she asks it again — which is exactly what production did.
   *
   * Bounded at three because she never offers more, and validated like anything
   * else that arrives from a client: it decides a navigation, so a path that did
   * not come from her would be an open redirect inside the app.
   */
  answering: z.array(z.object({
    label: z.string().min(1).max(80),
    path: z.string().min(1).max(200).regex(/^\/[\w\-/]*$/, 'an in-app path'),
  })).max(3).optional(),
});
export type AskDto = z.infer<typeof AskSchema>;

@Controller('mira')
@UseGuards(JwtAuthGuard)
export class MiraController {
  constructor(private readonly mira: MiraService, private readonly registry: MiraRegistry) {}

  /**
   * What Mira can do, generated from the decorators.
   *
   * In the product because it is the honest answer to "what can she do?" — and
   * because a generated list is the only kind that stays true.
   */
  @Get('capabilities')
  capabilities() {
    return this.registry.all().map(({ id, intent, risk, path }) => ({ id, intent, risk, path }));
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
      seed: dto.seed,
      answering: dto.answering,
    });
  }
}
