import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MasterProfileService } from './master-profile.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProfileController],
  providers: [ProfileService, MasterProfileService],
  exports: [MasterProfileService],
})
export class ProfileModule {}
