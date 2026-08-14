import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MedicalModule } from '../medical/medical.module';
import { BeautyController } from './beauty.controller';
import { BeautyService } from './beauty.service';
import { LookAnalysisService } from './look-analysis.service';
import { FinancialModule } from '../financial/financial.module';
import { AiModule } from '../ai/ai.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  // MedicalModule gives Beauty the consent-gated biomarker reader.
  imports: [PrismaModule, MedicalModule, FinancialModule, AiModule, ProfileModule],
  controllers: [BeautyController],
  providers: [BeautyService, LookAnalysisService],
  /** Mira reads the citizen's routine. The photo analyser stays inside. */
  exports: [BeautyService],
})
export class BeautyModule {}
