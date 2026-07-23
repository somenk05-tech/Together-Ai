import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaStatusController } from './media-status.controller';
import { MediaService } from './media.service';
import { StorageProvider } from './storage.provider';

@Module({
  controllers: [MediaController, MediaStatusController],
  providers: [MediaService, StorageProvider],
  exports: [MediaService, StorageProvider],
})
export class MediaModule {}
