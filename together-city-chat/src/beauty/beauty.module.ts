import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MedicalModule } from '../medical/medical.module';
import { BeautyController } from './beauty.controller';
import { BeautyService } from './beauty.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  // MedicalModule gives Beauty the consent-gated biomarker reader.
  imports: [PrismaModule, MedicalModule, FinancialModule],
  controllers: [BeautyController],
  providers: [BeautyService],
})
export class BeautyModule {}
