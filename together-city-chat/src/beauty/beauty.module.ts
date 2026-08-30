import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { MedicalModule } from '../medical/medical.module';
import { BeautyController } from './beauty.controller';
import { BeautyService } from './beauty.service';
import { LookAnalysisService } from './look-analysis.service';
import { FinancialModule } from '../financial/financial.module';
import { AiModule } from '../ai/ai.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  // MedicalModule gives Beauty the consent-gated biomarker reader.
  /* MediaModule for StorageProvider: deleting a look has to take the
     reference photograph out of the vault, and the key only exists until the
     column is nulled — see LookAnalysisService.remove. */
  imports: [PrismaModule, MedicalModule, FinancialModule, AiModule, ProfileModule, MediaModule],
  controllers: [BeautyController],
  providers: [BeautyService, LookAnalysisService],
  /** Mira reads the citizen's routine. The photo analyser stays inside. */
  exports: [BeautyService],
})
export class BeautyModule {}
