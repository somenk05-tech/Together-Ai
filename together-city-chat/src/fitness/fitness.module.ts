import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { MedicalModule } from '../medical/medical.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { FinancialModule } from '../financial/financial.module';
import { FitnessController } from './fitness.controller';
import { FitnessService } from './fitness.service';
import { SupplementsService } from './supplements/supplements.service';

@Module({
  // MedicalModule provides the consent-gated biomarker reader. NutritionModule
  // provides the one protein prescription — this hub asks for it rather than
  // keeping a second copy of a clinical rule. The edge only goes this way;
  // Nutrition does not import Fitness, so there is no cycle to break.
  //
  // FinancialModule is the ONE city till. The supplement store charges through
  // it rather than keeping its own ledger, which is what puts a bottle of D3
  // in the same monthly spending view as a restaurant bill — and what means
  // there is exactly one place in this codebase that knows how to take money.
  imports: [PrismaModule, ProfileModule, MedicalModule, NutritionModule, FinancialModule],
  controllers: [FitnessController],
  providers: [FitnessService, SupplementsService],
  /** Mira reads the citizen's plan and their log. */
  exports: [FitnessService],
})
export class FitnessModule {}
