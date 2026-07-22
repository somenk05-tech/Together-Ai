import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { PrismaService } from '../shared/prisma/prisma.service';
import { WebPushProvider } from './web-push.provider';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(
    private readonly webpush: WebPushProvider,
    private readonly prisma: PrismaService,
  ) {}

  /** The VAPID public key the browser needs to create a push subscription. */
  @Get('vapid-public-key')
  vapidKey() {
    return { key: this.webpush.publicKey };
  }

  /** Store (or refresh) this device's browser push subscription. */
  @Post('subscribe')
  @UsePipes(new ZodValidationPipe(z.object({
    subscription: z.object({ endpoint: z.string().url().max(2048) }).passthrough(),
  })))
  async subscribe(@CurrentUser() user: JwtUser, @Body() body: { subscription: unknown }) {
    if (!body?.subscription) return { ok: false };
    const token = JSON.stringify(body.subscription);
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId: user.sub, token, platform: 'webpush' },
      update: { userId: user.sub, platform: 'webpush' },
    });
    return { ok: true };
  }

  /** Remove this device's subscription (e.g. the user disabled notifications). */
  @Post('unsubscribe')
  @UsePipes(new ZodValidationPipe(z.object({
    subscription: z.object({ endpoint: z.string().max(2048) }).passthrough().optional(),
  })))
  async unsubscribe(@CurrentUser() _user: JwtUser, @Body() body: { subscription?: unknown }) {
    if (body?.subscription) {
      await this.prisma.deviceToken.deleteMany({ where: { token: JSON.stringify(body.subscription) } });
    }
    return { ok: true };
  }
}
