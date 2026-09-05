import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaStatusController } from './media-status.controller';
import { MediaService } from './media.service';
import { StorageProvider } from './storage.provider';
import { TranscodeService } from './transcode.service';
import { PrismaModule } from '../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MediaController, MediaStatusController],
  providers: [MediaService, StorageProvider, TranscodeService],
  exports: [MediaService, StorageProvider, TranscodeService],
})
export class MediaModule {}
