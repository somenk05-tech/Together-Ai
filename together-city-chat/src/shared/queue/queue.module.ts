import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/** Global, like RedisModule and AnalyticsModule: work is deferred from many hubs. */
@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
