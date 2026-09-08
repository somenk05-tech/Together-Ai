import { Global, Module } from '@nestjs/common';
import { HashMatchService } from './hash-match.service';

/**
 * Global, like RedisModule and QueueModule, and for the same reason: the gate
 * runs on THREE screening guards that live in three different hubs — dating,
 * messages and social. One provider, one policy, one place a match is recorded.
 * Registering it in each of those modules would be three chances for the
 * fourth surface somebody adds next to quietly not have it.
 */
@Global()
@Module({ providers: [HashMatchService], exports: [HashMatchService] })
export class HashMatchModule {}
