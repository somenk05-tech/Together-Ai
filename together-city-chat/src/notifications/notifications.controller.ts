import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { NotificationsService } from './notifications.service';

import { Mira } from '../mira/mira.decorator';
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * `?cursor=` + `?cursorId=` are the `createdAt` and `id` of the last item you
   * already hold; absent means the newest. BOTH, because two notifications can
   * share a millisecond and a cursor that carries only the timestamp skips the
   * second of them permanently.
   */
  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('cursor') cursor?: string,
    @Query('cursorId') cursorId?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number(limit);
    return this.notifications.listFor(user.sub, Number.isFinite(n) && n > 0 ? n : 50, cursor, cursorId);
  }

  @Mira({
    intent: 'Tell the citizen how many notifications are waiting',
    utterances: ['any notifications', 'anything new for me', 'did I miss anything'],
    risk: 'R0',
  })
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtUser) {
    return { count: await this.notifications.unreadCount(user.sub) };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    await this.notifications.markRead(user.sub, id);
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: JwtUser) {
    await this.notifications.markAllRead(user.sub);
    return { ok: true };
  }
}
