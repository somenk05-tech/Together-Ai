import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.users.me(user.sub);
  }

  /** Private discovery: find a single citizen by their exact @handle. */
  @Get('lookup')
  lookup(@CurrentUser() user: JwtUser, @Query('handle') handle: string) {
    return this.users.lookupByHandle(user.sub, handle ?? '');
  }

  @Get('online')
  online(@CurrentUser() user: JwtUser) {
    return this.users.onlineContacts(user.sub);
  }

  @Post('device-token')
  registerDevice(
    @CurrentUser() user: JwtUser,
    @Body() body: { token: string; platform: string },
  ) {
    return this.users.registerDeviceToken(user.sub, body.token, body.platform);
  }
}
