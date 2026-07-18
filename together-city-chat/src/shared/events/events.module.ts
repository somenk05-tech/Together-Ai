import { Global, Module } from '@nestjs/common';
import { ChatEventBus } from './chat-events';

@Global()
@Module({ providers: [ChatEventBus], exports: [ChatEventBus] })
export class EventsModule {}
