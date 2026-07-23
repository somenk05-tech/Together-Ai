import { Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';

/**
 * PUBLIC city header — location + live weather for the home strip. No auth so it
 * always resolves (even pre-login). Location priority: device lat/lng (from the
 * browser) → `city` hint (the caller's home city) → default. Date/day render
 * client-side in the user's locale.
 */
@Controller('city')
export class CityController {
  constructor(private readonly weather: WeatherService) {}

  @Get('header')
  header(@Query('lat') lat?: string, @Query('lng') lng?: string, @Query('city') city?: string) {
    const latN = lat != null && lat !== '' ? Number(lat) : undefined;
    const lngN = lng != null && lng !== '' ? Number(lng) : undefined;
    return this.weather.header({
      lat: Number.isFinite(latN) ? latN : undefined,
      lng: Number.isFinite(lngN) ? lngN : undefined,
      profileCity: city?.trim() || null,
    });
  }
}
