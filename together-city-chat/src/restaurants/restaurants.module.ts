import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { FinancialModule } from '../financial/financial.module';
import { MailModule } from '../mail/mail.module';
import { ProfileModule } from '../profile/profile.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { PlacesService } from './places.service';

@Module({
  imports: [PrismaModule, FinancialModule, MailModule, ProfileModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, PlacesService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
