import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AdminConsoleModule } from '../admin/admin.module';
import { MediaModule } from '../media/media.module';
import { SocialModule } from '../social/social.module';
import { DevPasswordGuard } from '../dev/dev-password.guard';
import { BroadcastController } from './broadcast.controller';
import { HubVideosController } from './hub-videos.controller';
import { BroadcastService } from './broadcast.service';
import { SocialAccountsService } from './accounts.service';

/**
 * The media desk. Its own module rather than more methods on DevService,
 * because it is the one part of /dev that reaches OUT of the city — and a thing
 * that posts in the city's name should be as easy to find, read and switch off
 * as it is to use.
 */
@Module({
  imports: [PrismaModule, AdminConsoleModule, MediaModule, SocialModule],
  controllers: [BroadcastController, HubVideosController],
  providers: [BroadcastService, SocialAccountsService, DevPasswordGuard],
})
export class BroadcastModule {}
