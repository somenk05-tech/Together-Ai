import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { FinancialModule } from '../financial/financial.module';
import { AstrologyController } from './astrology.controller';
import { AstrologyService } from './astrology.service';

@Module({
  imports: [PrismaModule, FinancialModule],
  controllers: [AstrologyController],
  providers: [AstrologyService],
})
export class AstrologyModule {}
