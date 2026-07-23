import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { WeatherService } from './weather.service';
import { MasterProfileService } from '../profile/master-profile.service';

@Controller('city')
@UseGuards(JwtAuthGuard)
export class CityController {
  constructor(
    private readonly weather: WeatherService,
    private readonly master: MasterProfileService,
  ) {}

  /**
   * GET /city/header?lat=&lng=
   * The dynamic city strip: location (device → home city → default) + live
   * weather. Date/day are rendered client-side in the user's locale.
   */
  @Get('header')
  async header(@CurrentUser() user: JwtUser, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const latN = lat != null ? Number(lat) : undefined;
    const lngN = lng != null ? Number(lng) : undefined;
    let profileCity: string | null = null;
    if (latN == null || lngN == null || Number.isNaN(latN) || Number.isNaN(lngN)) {
      const m = await this.master.get(user.sub).catch(() => null);
      profileCity = (m?.city as string | undefined) || (m?.birthCity as string | undefined) || null;
    }
    return this.weather.header({ lat: latN, lng: lngN, profileCity });
  }
}
