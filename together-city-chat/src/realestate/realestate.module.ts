import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { RealEstateController } from './realestate.controller';
import { RealEstateService } from './realestate.service';

@Module({
  imports: [PrismaModule],
  controllers: [RealEstateController],
  providers: [RealEstateService],
})
export class RealEstateModule {}
