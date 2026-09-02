import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MasterProfileService } from './master-profile.service';
import { CityProfilesService } from './city-profiles';
import { ConnectionsModule } from '../connections/connections.module';
import { AdminConsoleModule } from '../admin/admin.module';
import { MediaModule } from '../media/media.module';

@Module({
  // MediaModule for StorageProvider: the profile grid reads Post.media, which
  // holds private keys now — a grid that did not sign them would render every
  // photograph as a broken image.
  imports: [PrismaModule, ConnectionsModule, AdminConsoleModule, MediaModule],
  controllers: [ProfileController],
  providers: [ProfileService, MasterProfileService, CityProfilesService],
  exports: [MasterProfileService, CityProfilesService],
})
export class ProfileModule {}
