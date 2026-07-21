import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MedicalModule } from '../medical/medical.module';
import { BeautyController } from './beauty.controller';
import { BeautyService } from './beauty.service';
import { FinancialModule } from '../financial/financial.module';
import { AiModule } from '../ai/ai.module';

@Module({
  // MedicalModule gives Beauty the consent-gated biomarker reader.
  imports: [PrismaModule, MedicalModule, FinancialModule, AiModule],
  controllers: [BeautyController],
  providers: [BeautyService],
})
export class BeautyModule {}
