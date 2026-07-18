import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageProvider } from './storage.provider';

@Module({
  controllers: [MediaController],
  providers: [MediaService, StorageProvider],
  exports: [MediaService],
})
export class MediaModule {}
