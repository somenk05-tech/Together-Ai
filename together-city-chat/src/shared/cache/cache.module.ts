import { Global, Module } from '@nestjs/common';
import { ReadCache } from './read-cache.service';

/** Global, like RedisModule, because the cache is infrastructure rather than a
 *  feature: any module that reads something expensive should be able to ask for
 *  it without a wiring change, and it has no dependencies of its own beyond the
 *  Redis client that is already global. */
@Global()
@Module({ providers: [ReadCache], exports: [ReadCache] })
export class ReadCacheModule {}
