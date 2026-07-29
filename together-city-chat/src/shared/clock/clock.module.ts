import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock.service';

/** Global so any hub can ask what day it is for a citizen without re-plumbing. */
@Global()
@Module({ providers: [ClockService], exports: [ClockService] })
export class ClockModule {}
