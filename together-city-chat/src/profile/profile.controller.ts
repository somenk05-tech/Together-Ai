import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('summary')
  summary(@CurrentUser() user: JwtUser) {
    return this.profile.summary(user.sub);
  }

  @Patch('section')
  updateSection(@CurrentUser() user: JwtUser, @Body() body: { key: string; value: string }) {
    return this.profile.updateSection(user.sub, body.key, body.value);
  }
}
