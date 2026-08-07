import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

/**
 * Address search and reverse geocoding, proxied through this API.
 *
 * No key, no account, no bill — OpenStreetMap's Nominatim, which is free and
 * has a usage policy a browser cannot honour. See geo.service.ts for why that
 * makes a proxy the only correct shape, and for the third reason, which is
 * that the citizen's IP never reaches a third party.
 */
@Module({
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
