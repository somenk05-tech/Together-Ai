import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CronLease } from './cron-lease';

@Global()
@Module({ providers: [RedisService, CronLease], exports: [RedisService, CronLease] })
export class RedisModule {}
