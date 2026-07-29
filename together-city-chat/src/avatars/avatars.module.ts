import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { AvatarsController } from './avatars.controller';
import { AvatarsService } from './avatars.service';
import { AvatarProvider, DeterministicAvatarProvider } from './avatar-provider';

/**
 * The provider binding is the only line that changes when a real generation
 * model arrives. Everything else in the feature is written against the abstract
 * class and does not know which one it got.
 */
@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [AvatarsController],
  providers: [AvatarsService, { provide: AvatarProvider, useClass: DeterministicAvatarProvider }],
  exports: [AvatarsService],
})
export class AvatarsModule {}
