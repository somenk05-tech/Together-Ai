import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WeatherService } from './weather.service';
import { Public } from '../shared/public.decorator';

/**
 * PUBLIC city header — location + live weather for the home strip. No auth so it
 * always resolves (even pre-login). Location priority: device lat/lng (from the
 * browser) → `city` hint (the caller's home city) → default. Date/day render
 * client-side in the user's locale.
 */
@Controller('city')
export class CityController {
  constructor(private readonly weather: WeatherService) {}

  /**
   * TIGHTER THAN THE GLOBAL 120/MIN, because this one is @Public and reaches
   * two keyless third-party APIs on coordinates the caller chooses. Being
   * public, AccountThrottlerGuard keys it on the IP — which is the right unit
   * here: the header is read once or twice per page load by a browser that has
   * a location, and thirty a minute is far more than any honest client asks
   * for. (1M-DAU pass, 6 Sep.)
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
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
