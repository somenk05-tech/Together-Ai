import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MasterProfileService } from './master-profile.service';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [PrismaModule, ConnectionsModule],
  controllers: [ProfileController],
  providers: [ProfileService, MasterProfileService],
  exports: [MasterProfileService],
})
export class ProfileModule {}
