import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PresenceService } from './presence.service';
import { MediaModule } from '../media/media.module';
import { PostMediaGuard } from '../social/post-media-guard';

/* MediaModule is imported for StorageProvider alone: PostMediaGuard takes it in
   its constructor, and the avatar path screens through the same guard the feed
   uses. Same wiring SocialModule and MessagesModule already use. */
@Module({
  imports: [MediaModule],
  controllers: [UsersController],
  providers: [UsersService, PresenceService, PostMediaGuard],
  exports: [UsersService, PresenceService],
})
export class UsersModule {}
