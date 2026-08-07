import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GeoService } from './geo.service';

/**
 * The address lookup behind the map.
 *
 * AUTHENTICATED, like everything else here. An open geocoding endpoint on a
 * public URL is somebody else's free Nominatim proxy within a week, and the
 * bill for that is not money — it is this application's User-Agent being the
 * one OSM blocks.
 *
 * THROTTLED WELL BELOW THE GLOBAL LIMIT. The API allows 120 requests a minute;
 * a person typing an address needs a handful. The service queues at one per
 * second upstream regardless, so a caller who exceeds this is queueing behind
 * themselves — the throttle just says so instead of hanging.
 */
@Controller('geo')
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@UseGuards(ThrottlerGuard)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('search')
  search(@Query('q') q?: string, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const la = Number(lat), ln = Number(lng);
    const near = Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : undefined;
    return this.geo.search(q ?? '', near).then((items) => ({ items }));
  }

  @Get('reverse')
  reverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.geo.reverse(Number(lat), Number(lng)).then((place) => ({ place }));
  }
}
