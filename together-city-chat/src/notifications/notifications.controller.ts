import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.notifications.listFor(user.sub);
  }

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
