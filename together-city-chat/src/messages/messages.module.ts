import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { MediaModule } from '../media/media.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ChatMediaGuard } from './chat-media-guard';

/**
 * MediaModule is imported for StorageProvider alone: ChatMediaGuard reads the
 * bytes of an attachment out of the public bucket before the message naming it
 * is delivered.
 *
 * It deliberately does NOT import DatingModule, even though the classifier it
 * uses lives there. `verdictFor` is a pure function and is imported as one — a
 * module edge from messages to dating would be a new cycle risk for the sake of
 * a thresholds comparison, and this way the two share the RULE without sharing
 * a lifecycle.
 */
@Module({
  imports: [ConnectionsModule, MediaModule],
  controllers: [MessagesController],
  providers: [MessagesService, ChatMediaGuard],
  exports: [MessagesService],
})
export class MessagesModule {}
