import { Controller, Get } from '@nestjs/common';
import { StorageProvider } from './storage.provider';

/**
 * Public, read-only diagnostic: reports the LIVE CORS policy on the media +
 * health buckets. Exposes only bucket names + already-public CORS origins/methods
 * (no secrets), so browser uploads can be verified without reading server logs.
 */
@Controller('media')
export class MediaStatusController {
  constructor(private readonly storage: StorageProvider) {}

  @Get('cors-status')
  corsStatus() {
    return this.storage.corsStatus();
  }
}
