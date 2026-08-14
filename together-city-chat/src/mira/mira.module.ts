import { Module } from '@nestjs/common';
import { FinancialModule } from '../financial/financial.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { DriveModule } from '../drive/drive.module';
import { MiraController } from './mira.controller';
import { MiraService } from './mira.service';

/**
 * Mira imports the hubs she reads from; she owns no data of her own.
 *
 * That is the "chrome, not a hub" claim made structurally: if this module ever
 * needs a Prisma model to answer a question, something has been built in the
 * wrong place.
 */
@Module({
  imports: [FinancialModule, RestaurantsModule, DriveModule],
  controllers: [MiraController],
  providers: [MiraService],
  exports: [MiraService],
})
export class MiraModule {}
