import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
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

  @Post('avatar')
  @UsePipes(new ZodValidationPipe(z.object({
    image: z.string().min(1).max(600_000).regex(/^data:image\/(png|jpe?g|webp);base64,/, 'must be a base64 image data URL'),
  })))
  setAvatar(@CurrentUser() user: JwtUser, @Body() body: { image: string }) {
    return this.users.setAvatar(user.sub, body?.image ?? '');
  }

  @Post('device-token')
  @UsePipes(new ZodValidationPipe(z.object({
    token: z.string().min(8).max(4096),
    platform: z.string().min(2).max(24).regex(/^[a-z0-9_-]+$/i),
  })))
  registerDevice(
    @CurrentUser() user: JwtUser,
    @Body() body: { token: string; platform: string },
  ) {
    return this.users.registerDeviceToken(user.sub, body.token, body.platform);
  }
}
