import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MasterProfileService } from './master-profile.service';
import { CityProfilesService } from './city-profiles';
import { ConnectionsModule } from '../connections/connections.module';
import { AdminConsoleModule } from '../admin/admin.module';
import { MediaModule } from '../media/media.module';
import { FinancialModule } from '../financial/financial.module';
import { ProfileEditMeterService } from './profile-edit-meter.service';

@Module({
  // MediaModule for StorageProvider: the profile grid reads Post.media, which
  // holds private keys now — a grid that did not sign them would render every
  // photograph as a broken image.
  // FinancialModule for the profile-edit meter: five free changes a month,
  // ₹50 each after (5 Sep), charged through the one city wallet.
  imports: [PrismaModule, ConnectionsModule, AdminConsoleModule, MediaModule, FinancialModule],
  controllers: [ProfileController],
  providers: [ProfileService, MasterProfileService, CityProfilesService, ProfileEditMeterService],
  exports: [MasterProfileService, CityProfilesService, ProfileEditMeterService],
})
export class ProfileModule {}
