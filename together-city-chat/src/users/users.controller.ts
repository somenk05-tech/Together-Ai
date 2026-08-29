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
}

/* POST /users/device-token IS GONE (fifth audit, 29 Aug), and this note is
   here so that the next person who needs a native push token adds it in the
   right place rather than re-adding this one.
   `DeviceToken.token` is globally unique, and that route upserted on the token
   ALONE — `update: { userId, platform }` — so anybody holding another
   citizen's subscription string could re-point it at their own account: the
   victim's notifications, dating message previews included, rendering on the
   attacker's device while the victim stopped receiving their own. Forty lines
   away, `push.controller.ts` guards exactly this and writes down why ("Claim
   it only when it is unclaimed or already ours"); this route was the same
   upsert with the check missing, and `platform` was client-supplied so a
   browser could also file itself under the FCM branch.
   Nothing called it. `usersApi.registerDevice` had no callers in the web app,
   and there is no native client yet. When there is one, its token registration
   goes through `push.controller`'s claim check. */
