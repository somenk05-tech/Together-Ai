import { Controller, Get } from '@nestjs/common';
import { StorageProvider } from './storage.provider';

/**
 * Read-only diagnostic: reports the LIVE CORS policy on the media + health
 * buckets so browser uploads can be verified without reading server logs.
 * Exposes only bucket names and already-public CORS origins/methods.
 *
 * Deliberately NOT marked @Public(): it used to be reachable anonymously purely
 * because this class omitted a guard, and it names the buckets while issuing an
 * outbound request per call. Signed-in citizens can still reach it, which is all
 * the diagnostic ever needed.
 */
@Controller('media')
export class MediaStatusController {
  constructor(private readonly storage: StorageProvider) {}

  @Get('cors-status')
  corsStatus() {
    return this.storage.corsStatus();
  }
}
