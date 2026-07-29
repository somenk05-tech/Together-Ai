import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { AccountPurgeService } from './account-purge.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, AccountPurgeService],
  exports: [PrivacyService, AccountPurgeService],
})
export class PrivacyModule {}
