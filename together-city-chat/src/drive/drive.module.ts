import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';

/** The citizen's private online drive (folders, files, attachments). */
@Module({
  imports: [MediaModule], // StorageProvider — private vault presigning
  controllers: [DriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
